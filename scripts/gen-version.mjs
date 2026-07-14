/**
 * 앱 버전 자동 생성 스크립트.
 * 형식: 01YYYYMMDD_HHmm_(수정횟수)  예) 0120260714_0932_59
 *  - 앞 "01" 은 날짜처럼 안 보이게 하는 고정 접두어.
 *  - YYYYMMDD_HHmm 은 최신 커밋(HEAD)의 커밋 시각(UTC) → 커밋할 때마다 자동으로 올라간다.
 *  - 마지막 숫자는 시스템 수정 횟수(version-edits.json 의 edits). 의미있는 변경 때 1씩 올림.
 * dev/build 앞에서 자동 실행되어 src/lib/appVersion.ts 를 갱신한다.
 *
 * 커밋 "시각"을 쓰는 이유: Vercel 은 배포 시 git 을 얕게(shallow) 클론해서
 * `git rev-list --count HEAD` 가 전체 히스토리를 못 세고 로컬과 다른 값을 반환한다.
 * 커밋 시각은 얕은 클론에서도 HEAD 커밋 메타데이터라 항상 정확하고, 수정 횟수는
 * 추적되는 파일(version-edits.json)에서 읽으므로 어느 환경에서든 동일하다.
 */
import { execSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../src/lib/appVersion.ts");
const EDITS_FILE = resolve(here, "../version-edits.json");

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const sha =
  sh("git rev-parse --short HEAD") ||
  (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);

// HEAD 커밋의 커밋 시각(UTC) - 얕은 클론이어도 항상 구할 수 있다.
const commitIso = sh("git log -1 --format=%cI");
const d = commitIso ? new Date(commitIso) : null;

function pad(n) {
  return String(n).padStart(2, "0");
}

// 수정 횟수(추적 파일에서 읽음) - 없거나 깨지면 0
let edits = 0;
try {
  edits = JSON.parse(readFileSync(EDITS_FILE, "utf8")).edits ?? 0;
} catch {
  edits = 0;
}

const version =
  d && !Number.isNaN(d.getTime())
    ? `01${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}_${edits}`
    : `01_${edits}`; // git 을 전혀 못 쓰는 환경(로컬 tarball 등) 대비 폴백

const buildDate = commitIso ? commitIso.slice(0, 10) : "";

const body = `// 이 파일은 scripts/gen-version.mjs 가 자동 생성합니다. 직접 수정하지 마세요.
// 커밋할 때마다 버전(최신 커밋 시각)이 자동으로 올라갑니다.
export const APP_VERSION = ${JSON.stringify(version)};
export const BUILD_SHA = ${JSON.stringify(sha)};
export const BUILD_DATE = ${JSON.stringify(buildDate)};
`;

writeFileSync(OUT, body);
console.log(`버전 생성: v${version} (${sha || "no-sha"})`);
