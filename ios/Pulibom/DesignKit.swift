import SwiftUI

// 앱 공통 모양: iOS 설정 앱처럼 둥근 묶음(FormGroup) 안에 한 줄씩(FormRow)

struct FormGroup<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .background(Color.paper, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.line, lineWidth: 1))
    }
}

struct FormRow<Content: View>: View {
    let label: String
    var last = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                Text(label)
                    .foregroundStyle(Color.ink)
                    .frame(width: 84, alignment: .leading)
                content
                    .font(.title3)
                    .foregroundStyle(Color.ink)
                    .tint(Color.honeyDeep)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .frame(minHeight: 56)
            .padding(.horizontal, 18)
            if !last {
                Rectangle().fill(Color.line).frame(height: 1).padding(.leading, 18)
            }
        }
    }
}

// 고르기 칸 오른쪽 값 + ⌄
struct MenuValue: View {
    let text: String

    var body: some View {
        HStack(spacing: 6) {
            Text(text).foregroundStyle(Color.ink).lineLimit(1)
            Image(systemName: "chevron.up.chevron.down")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.muted)
        }
    }
}

// 병아리 둥실둥실: 위아래로 떠오르며 좌우로 살짝 기운다
struct Bobbing: ViewModifier {
    @State private var up = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .offset(y: up ? -10 : 0)
            .rotationEffect(.degrees(up ? -4 : 3), anchor: .bottom)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) { up = true }
            }
    }
}

// 처음 나타날 때 아래에서 올라오며 (delay 로 차례차례)
struct RiseIn: ViewModifier {
    var delay: Double = 0
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 18)
            .onAppear {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(delay)) { shown = true }
            }
    }
}

extension View {
    // 시작 화면 병아리 → 로그인 화면 병아리로 이어서 움직이기
    @ViewBuilder func matchedLogo(_ ns: Namespace.ID?, isSource: Bool) -> some View {
        if let ns { matchedGeometryEffect(id: "logo-chick", in: ns, isSource: isSource) } else { self }
    }

    func bobbing() -> some View { modifier(Bobbing()) }
    func riseIn(delay: Double = 0) -> some View { modifier(RiseIn(delay: delay)) }
}

// 누르면 바로 살짝 들어가고, 떼면 탄력 있게 돌아오는 버튼 모양
struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.96

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(
                configuration.isPressed ? .easeOut(duration: 0.08) : .spring(response: 0.32, dampingFraction: 0.55),
                value: configuration.isPressed
            )
    }
}

extension ButtonStyle where Self == PressableStyle {
    static var pressable: PressableStyle { PressableStyle() }
}

struct PrimaryButton: View {
    let title: String
    var busy = false
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(Color.ink) }
                Text(title).font(.headline)
            }
            .foregroundStyle(Color.ink)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(Color.honey, in: RoundedRectangle(cornerRadius: 18))
            .contentShape(RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(.pressable)
        .disabled(busy || disabled)
        .opacity(busy || disabled ? 0.5 : 1)
    }
}

struct Notice: View {
    enum Kind { case error, ok }
    let text: String
    var kind: Kind = .error

    var body: some View {
        Label(text, systemImage: kind == .error ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
            .font(.subheadline)
            .foregroundStyle(kind == .error ? Color.salmonDeep : Color.sageDeep)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(kind == .error ? Color.salmonSoft : Color.sageSoft, in: RoundedRectangle(cornerRadius: 14))
    }
}

extension Color {
    static let olive = Color(hex: 0x847A4C)
    static let sand = Color(hex: 0xF3ECDC)
    static let sageSoft = Color(hex: 0xE6ECDF)
    static let sageDeep = Color(hex: 0x5D7A50)
    static let salmonSoft = Color(hex: 0xF8E1DA)
    static let salmonDeep = Color(hex: 0xB5624F)
}
