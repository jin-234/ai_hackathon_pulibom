// 문제 글: 객관식 보기(①②③…)가 한 줄에 이어져 있으면 번호마다 줄을 나눠 보여 준다
//   "점 C(0, 7)에 대한 설명으로 옳은 것은? (① x축 위에 있다 ② y축 위에 있다 …)" →
//   점 C(0, 7)에 대한 설명으로 옳은 것은?
//   ① x축 위에 있다
//   ② y축 위에 있다 …
const MARK = /[①-⑩]/;

export function splitChoices(text: string): { stem: string; choices: string[] } {
  const at = text.search(MARK);
  if (at < 0) return { stem: text, choices: [] };
  let stem = text.slice(0, at).trimEnd();
  let rest = text.slice(at);
  // 보기 전체를 감싼 괄호 "( … )" 는 뗀다
  if (stem.endsWith("(") && rest.trimEnd().endsWith(")")) {
    stem = stem.slice(0, -1).trimEnd();
    rest = rest.trimEnd().slice(0, -1);
  }
  const choices = rest
    .split(/(?=[①-⑩])/)
    .map((c) => c.trim().replace(/[,，]$/, ""))
    .filter(Boolean);
  return { stem, choices };
}

export default function QuestionText({ text, className = "" }: { text: string; className?: string }) {
  const { stem, choices } = splitChoices(text);
  if (!choices.length) return <span className={className}>{text}</span>;
  return (
    <span className={`inline-flex flex-col gap-1 text-left ${className}`}>
      {stem && <span>{stem}</span>}
      <span className="flex flex-col gap-0.5">
        {choices.map((c, i) => (
          <span key={i} className="pl-1">
            {c}
          </span>
        ))}
      </span>
    </span>
  );
}
