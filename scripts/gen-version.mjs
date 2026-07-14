/**
 * 앱 버전 자동 생성 스크립트.
 * git 커밋 수를 패치 버전으로 써서, 코드를 수정(커밋)할 때마다 버전이 1씩 올라간다.
 * dev/build 앞에서 자동 실행되어 src/lib/appVersion.ts 를 갱신한다.
 *  - git 을 못 쓰는 환경이면 날짜 기반 버전으로 폴백.
 */
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../src/lib/appVersion.ts");

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const count = sh("git rev-list --count HEAD");
const sha =
  sh("git rev-parse --short HEAD") ||
  (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);
const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// 커밋 수가 있으면 1.0.{커밋수}, 없으면 날짜 기반으로 폴백
const version = /^\d+$/.test(count)
  ? `1.0.${count}`
  : `1.0.${date.replace(/-/g, "")}`;

const body = `// 이 파일은 scripts/gen-version.mjs 가 자동 생성합니다. 직접 수정하지 마세요.
// 커밋할 때마다 버전(커밋 수)이 자동으로 올라갑니다.
export const APP_VERSION = ${JSON.stringify(version)};
export const BUILD_SHA = ${JSON.stringify(sha)};
export const BUILD_DATE = ${JSON.stringify(date)};
`;

writeFileSync(OUT, body);
console.log(`버전 생성: v${version} (${sha || "no-sha"}, ${date})`);
