import type { Problem } from "./types";

// 중1 '문자와 식 · 일차방정식' 시연용 과제 (직접 제작한 문항)
export const ASSIGNMENT = {
  id: "a1",
  title: "수학 1-1 · 일차방정식",
  due: "오늘",
};

export const PROBLEMS: Problem[] = [
  {
    id: "p1",
    title: "일차방정식 풀기",
    question: "2x + 3 = 11",
    answer: "x=4",
    concept: "등식의 성질·이항",
    solution: ["2x + 3 = 11", "2x = 11 - 3", "2x = 8", "x = 4"],
  },
  {
    id: "p2",
    title: "일차방정식 풀기",
    question: "3x + 6 = 15",
    answer: "x=3",
    concept: "등식의 성질·이항",
    solution: ["3x + 6 = 15", "3x = 15 - 6", "3x = 9", "x = 3"],
  },
  {
    id: "p3",
    title: "음수가 있는 일차방정식",
    question: "5x - 7 = 3",
    answer: "x=2",
    concept: "이항·정수 계산",
    solution: ["5x - 7 = 3", "5x = 3 + 7", "5x = 10", "x = 2"],
  },
  {
    id: "p4",
    title: "양변에 x가 있는 방정식",
    question: "4x - 5 = 2x + 7",
    answer: "x=6",
    concept: "동류항 정리·이항",
    solution: ["4x - 5 = 2x + 7", "4x - 2x = 7 + 5", "2x = 12", "x = 6"],
  },
  {
    id: "p5",
    title: "괄호가 있는 방정식",
    question: "3(x - 2) = x + 4",
    answer: "x=5",
    concept: "분배법칙·동류항 정리",
    solution: ["3(x - 2) = x + 4", "3x - 6 = x + 4", "3x - x = 4 + 6", "2x = 10", "x = 5"],
  },
  {
    id: "p6",
    title: "음수 계수 방정식",
    question: "-2x + 9 = 1",
    answer: "x=4",
    concept: "정수 계산·계수 나누기",
    solution: ["-2x + 9 = 1", "-2x = 1 - 9", "-2x = -8", "x = 4"],
  },
];

export function getProblem(id: string) {
  return PROBLEMS.find((p) => p.id === id);
}
