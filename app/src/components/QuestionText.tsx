// 문제 글: 객관식 보기(①②③…)가 한 줄에 이어져 있으면 번호마다 줄을 나눠 보여 준다
//   "점 C(0, 7)에 대한 설명으로 옳은 것은? (① x축 위에 있다 ② y축 위에 있다 …)" →
//   점 C(0, 7)에 대한 설명으로 옳은 것은?
//   ① x축 위에 있다
//   ② y축 위에 있다 …
import { splitChoices } from "@/lib/problemFormat";

export { splitChoices };

export default function QuestionText({ text, className = "" }: { text: string; className?: string }) {
  const { stem, choices } = splitChoices(text);
  // 문제 글 안의 줄바꿈('다음을 계산하시오.\n(2 + 3i)(1 - i)')은 그대로 보이게 (whitespace-pre-line)
  if (!choices.length) return <span className={`whitespace-pre-line ${className}`}>{text}</span>;
  return (
    <span className={`inline-flex flex-col gap-1 text-left ${className}`}>
      {stem && <span className="whitespace-pre-line">{stem}</span>}
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
