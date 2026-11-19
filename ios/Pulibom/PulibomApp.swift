import SwiftUI

// 풀이봄 학생용 아이패드 앱
// 앱 안에서 풀이봄 웹의 학생 화면(/student)을 띄운다. 교사 화면은 웹사이트로만 쓴다.
@main
struct PulibomApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                // 앱 색은 밝은 크림 바탕으로 정해져 있어서, 기기가 다크 모드여도 글자가 흰색으로 바뀌어 안 보이지 않게
                .preferredColorScheme(.light)
        }
    }
}

extension Color {
    // app/src/app/globals.css 의 디자인 토큰과 같은 색
    static let cream = Color(hex: 0xFAF6EC)
    static let paper = Color(hex: 0xFFFDF8)
    static let line = Color(hex: 0xEBE3D1)
    static let ink = Color(hex: 0x2D2B26)
    static let muted = Color(hex: 0x8C8577)
    static let honey = Color(hex: 0xF5D66F)
    static let honeySoft = Color(hex: 0xFBEDBD)
    static let honeyDeep = Color(hex: 0xE2B53C)

    init(hex: UInt32) {
        self.init(red: Double(hex >> 16 & 0xFF) / 255, green: Double(hex >> 8 & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}
