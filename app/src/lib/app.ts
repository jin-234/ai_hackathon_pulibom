// 학생용 아이패드 앱(ios/) 구분: 앱의 웹뷰는 User-Agent 끝에 이 이름을 붙인다.
// 앱에서는 학생 화면만 쓰고, 교사 화면은 웹사이트로만 연다.
// 학생 화면에서 data-app-hide 가 붙은 요소(로고·과제 목록·이름·로그아웃)는 앱이 숨기고 앱 상단 바로 대신한다.
export const APP_UA = "PulibomApp";

export function isAppUA(ua: string | null | undefined) {
  return !!ua && ua.includes(APP_UA);
}
