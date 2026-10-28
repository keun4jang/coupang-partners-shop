import React from "react";

/**
 * 말이 끊기는 자리에서 줄바꿈 (2026-10-22 사장님: "문장 줄바꿈할 때 간격에 맞춰서 줄바꿈이 돼야 - 한 줄에 다 쓸 필요는 없으니까").
 * 브라우저 균형 줄바꿈(text-wrap: balance)은 길이만 맞춰서 "칸마다 넣을 / 음식이"처럼 말 중간을 자른다.
 * 그래서 쉼표·물음표 뒤 > 이어 주는 말끝(~해야, ~하면, ~해서 …) 뒤 > 조사(~이, ~를, ~에 …) 뒤 순으로, 가운데에 가까운 자리를 골라 끊는다.
 * 짧은 문장(14자 미만)은 그대로, 마땅한 자리가 없으면 브라우저에 맡긴다.
 */
/** 끊기 좋은 자리 - 1순위 문장부호, 2순위 이어 주는 말끝, 3순위 주제 조사(은·는), 4순위 다른 조사 뒤 */
const PUNCT = /[,?!·]$/;
const CONNECTIVE = /(는데|은데|야|면|어서|아서|해서|면서|려서|워서|겨서|져서|러서|쳐서|와서|가서|니|며|도록|지만|려면|수록|만큼|않아|어도|아도|해도|러도|도)$|[^장창]고$/;
const TOPIC = /(은|는)$/;
const PARTICLE = /(이|가|을|를|에|에서|로|으로|만|부터)$/;
/** 꾸미는 말(쓰는 것, 닿은 곳, 되는 솜)은 뒤 낱말과 붙어야 한다 - 은·는으로 끝나도 끊지 않는다 */
const ADNOMINAL = /(되|하|있|없|닿|받|오|가|보|나|들|드|쓰|사|넣|생기|빠지|히|보이|줄이|새|밴|남|젖|좁|넓|맞|찾|붙|빠|닫|타)(는|은)$/;
/** "빨고 나면", "해 보세요"처럼 붙어 다니는 말은 가르지 않는다 */
const GLUED_NEXT = /^(나면|나서|나니|있|싶|보|두|줘|주|봐)/;

/** 이 낱말 뒤에서 끊어도 되는가 (자막 묶음용) - 0 이면 안 됨, 숫자가 작을수록 좋은 자리 */
/** 다음 낱말이 앞말에 붙어 다니는 말인가 (쌓아 두면, 해 보세요) */
export function gluedNext(next?: string): boolean {
  return !!next && GLUED_NEXT.test(next);
}

export function breakTier(word: string, next?: string): number {
  const tier = PUNCT.test(word) ? 1 : CONNECTIVE.test(word) ? 2 : TOPIC.test(word) && !ADNOMINAL.test(word) ? 3 : PARTICLE.test(word) ? 4 : 0;
  if (tier === 2 && next && GLUED_NEXT.test(next)) return 0;
  return tier;
}

export function splitPhrase(text: string): [string, string] | null {
  const t = text.trim();
  if (t.length < 14) return null;
  const words = t.split(/\s+/);
  let best: { i: number; tier: number; d: number } | null = null;
  let pos = 0;
  for (let i = 0; i < words.length - 1; i++) {
    pos += words[i].length + (i > 0 ? 1 : 0);
    const w = words[i];
    const tier = PUNCT.test(w)
      ? 1
      : CONNECTIVE.test(w)
        ? 2
        : TOPIC.test(w) && !ADNOMINAL.test(w)
          ? 3
          : PARTICLE.test(w)
            ? 4
            : 0;
    if (!tier) continue;
    if (tier === 2 && GLUED_NEXT.test(words[i + 1])) continue;
    const ratio = pos / t.length;
    if (ratio < 0.25 || ratio > 0.75) continue;
    const d = Math.abs(ratio - 0.5);
    if (!best || tier < best.tier || (tier === best.tier && d < best.d)) best = { i, tier, d };
  }
  if (!best) return null;
  return [words.slice(0, best.i + 1).join(" "), words.slice(best.i + 1).join(" ")];
}

/** 끊을 자리가 있으면 두 줄로 (각 줄 안에서는 단어 단위로만 넘친다) */
export const PhraseLines: React.FC<{ text: string }> = ({ text }) => {
  const parts = splitPhrase(text);
  if (!parts) return <>{text}</>;
  return (
    <>
      <span style={{ display: "inline-block" }}>{parts[0]}</span>
      <br />
      <span style={{ display: "inline-block" }}>{parts[1]}</span>
    </>
  );
};
