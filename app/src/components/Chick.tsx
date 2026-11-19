// 풀이봄 병아리 캐릭터 (SVG)
type Props = {
  size?: number;
  pose?: "plain" | "sprout" | "pencil";
  className?: string;
  // 움직임: bob 둥실둥실·눈 깜빡 / cheer 통통 뛰며 날개 파닥 (globals.css 의 chick-*)
  motion?: "bob" | "cheer";
};

export default function Chick({ size = 48, pose = "plain", className, motion }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={[className, motion && `chick-${motion}`].filter(Boolean).join(" ") || undefined}
      style={{ overflow: "visible" }}
      aria-hidden
    >
      {pose === "sprout" && (
        <g>
          <path d="M50 18 C50 10 50 8 50 4" stroke="#7d9a6a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M50 8 C42 2 34 6 36 12 C42 14 48 12 50 8Z" fill="#9bb487" />
          <path d="M50 6 C58 0 66 4 64 10 C58 12 52 10 50 6Z" fill="#87a07a" />
        </g>
      )}
      {/* 몸 */}
      <path
        d="M50 16 C72 16 86 34 86 56 C86 78 70 92 50 92 C30 92 14 78 14 56 C14 34 28 16 50 16Z"
        fill="#f8dc7c"
        stroke="#e7bf4f"
        strokeWidth="1.5"
      />
      {/* 머리깃 */}
      <path d="M46 17 C44 10 48 8 50 13 C51 8 56 9 54 17" fill="#f8dc7c" stroke="#e7bf4f" strokeWidth="1.5" />
      {/* 날개 */}
      <path className="chick-wing-l" d="M17 60 C10 64 12 72 20 70" fill="#f3cf62" />
      <path className="chick-wing-r" d="M83 60 C90 64 88 72 80 70" fill="#f3cf62" />
      {/* 눈 */}
      <g className="chick-eyes">
        <ellipse cx="38" cy="50" rx="3.6" ry="4.4" fill="#2d2b26" />
        <ellipse cx="62" cy="50" rx="3.6" ry="4.4" fill="#2d2b26" />
        <circle cx="39.2" cy="48.4" r="1.2" fill="#fff" />
        <circle cx="63.2" cy="48.4" r="1.2" fill="#fff" />
      </g>
      {/* 볼 */}
      <ellipse cx="30" cy="60" rx="5" ry="3" fill="#f2a98f" opacity="0.55" />
      <ellipse cx="70" cy="60" rx="5" ry="3" fill="#f2a98f" opacity="0.55" />
      {/* 부리 */}
      <path d="M45 56 L55 56 L50 63 Z" fill="#ec9a3e" />
      {pose === "pencil" && (
        <g transform="rotate(-25 78 66)">
          <rect x="74" y="44" width="8" height="34" rx="1.5" fill="#f5c04a" stroke="#c99a2e" strokeWidth="1" />
          <path d="M74 78 L82 78 L78 86 Z" fill="#f1dcc0" />
          <path d="M77 83 L79 83 L78 86 Z" fill="#2d2b26" />
          <rect x="74" y="42" width="8" height="4" fill="#e8a090" />
        </g>
      )}
      {/* 발 */}
      <path d="M40 91 L40 96 M37 96 L43 96 M60 91 L60 96 M57 96 L63 96" stroke="#ec9a3e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
