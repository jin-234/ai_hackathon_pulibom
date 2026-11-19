import SwiftUI

// 앱을 켜면 잠깐 나오는 시작 화면: 병아리가 떨어지듯 나타나 두 번 통통 뛰고, 풀이봄 로고가 올라온다.
// 끝나면 병아리는 그대로 로그인 화면의 병아리 자리로 날아간다 (matchedGeometryEffect "logo-chick")
struct SplashView: View {
    let logo: Namespace.ID
    let onFinish: () -> Void // 점프·로고가 다 보이고 나면 (화면에 실제로 나온 때부터 센다)

    @State private var landed = false
    @State private var hop = 0
    @State private var showText = false

    var body: some View {
        ZStack {
            // 뒤의 로그인 화면이 비치지 않게 불투명한 바탕 위에 그라데이션
            Color.cream.ignoresSafeArea()
            LinearGradient(colors: [Color.honeySoft, Color.honey.opacity(0.55)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 22) {
                Image("Chick")
                    .resizable()
                    .frame(width: 190, height: 190)
                    .matchedGeometryEffect(id: "logo-chick", in: logo)
                    .keyframeAnimator(initialValue: HopFrame(), trigger: hop) { content, f in
                        content
                            .scaleEffect(x: f.sx, y: f.sy, anchor: .bottom)
                            .offset(y: f.y)
                    } keyframes: { _ in
                        // 웅크림 → 높이 점프 → 착지 찌그러짐 → 작은 점프 → 제자리
                        KeyframeTrack(\.y) {
                            CubicKeyframe(0, duration: 0.12)
                            CubicKeyframe(-80, duration: 0.26)
                            CubicKeyframe(0, duration: 0.22)
                            CubicKeyframe(-34, duration: 0.18)
                            CubicKeyframe(0, duration: 0.16)
                        }
                        KeyframeTrack(\.sx) {
                            CubicKeyframe(1.16, duration: 0.12)
                            CubicKeyframe(0.9, duration: 0.26)
                            CubicKeyframe(1.18, duration: 0.22)
                            CubicKeyframe(0.96, duration: 0.18)
                            SpringKeyframe(1, duration: 0.3)
                        }
                        KeyframeTrack(\.sy) {
                            CubicKeyframe(0.84, duration: 0.12)
                            CubicKeyframe(1.12, duration: 0.26)
                            CubicKeyframe(0.82, duration: 0.22)
                            CubicKeyframe(1.05, duration: 0.18)
                            SpringKeyframe(1, duration: 0.3)
                        }
                    }
                    .shadow(color: Color.honeyDeep.opacity(0.35), radius: 18, y: 12)
                    .scaleEffect(landed ? 1 : 0.4)
                    .offset(y: landed ? 0 : -160)
                    .opacity(landed ? 1 : 0)

                VStack(spacing: 8) {
                    (Text("풀이봄") + Text(".").foregroundStyle(Color.honeyDeep))
                        .font(.system(size: 52, weight: .heavy))
                        .foregroundStyle(Color.ink)
                    Text("풀이를 모아, 배움을 잇다")
                        .font(.title3)
                        .foregroundStyle(Color.olive)
                }
                .opacity(showText ? 1 : 0)
                .offset(y: showText ? 0 : 16)
            }
        }
        .task {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.62)) { landed = true }
            try? await Task.sleep(for: .seconds(0.45))
            hop += 1
            withAnimation(.easeOut(duration: 0.5).delay(0.25)) { showText = true }
            try? await Task.sleep(for: .seconds(1.7))
            onFinish()
        }
    }
}

private struct HopFrame {
    var y: CGFloat = 0
    var sx: CGFloat = 1
    var sy: CGFloat = 1
}
