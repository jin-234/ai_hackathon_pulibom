// 학생 과제 목록 정렬 (서버 페이지와 정렬 고르기 칸이 같이 쓴다)
export const SORT_LABEL = { due: "마감순", new: "최신순", old: "오래된순", name: "이름순" } as const;
export type SortKey = keyof typeof SORT_LABEL;
export const SORT_COOKIE = "student_sort"; // 고른 정렬을 기억 (문제를 풀고 돌아와도 그대로)
