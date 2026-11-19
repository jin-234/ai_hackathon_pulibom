import SwiftUI

// 로그인 뒤 화면: 앱 상단 바 + 웹 학생 화면
// 상단 바: 왼쪽 풀이봄(과제 목록에선) / ← 과제 목록(문제 푸는 중), 오른쪽 학생 이름·로그아웃
// 하단 탭 바: 지금 풀 과제 / 다 푼 과제 / 지난 과제 (문제 푸는 중엔 숨김 → 필기 칸을 넓게)
struct StudentShellView: View {
    let url: URL
    let student: LoggedInStudent
    let reloadToken: Int
    let onLoaded: () -> Void
    let onError: (String) -> Void
    let onLoggedOut: () -> Void
    let onOpenSettings: () -> Void

    @StateObject private var web = WebController()
    @State private var confirmLogout = false
    @State private var showChat = false
    @State private var unread = 0
    @Namespace private var tabPill

    private var onList: Bool { web.path == "/student" || web.path == "/student/" }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            StudentWebView(
                url: url,
                controller: web,
                reloadToken: reloadToken,
                onLoaded: onLoaded,
                onError: onError,
                onLoggedOut: onLoggedOut,
                onOpenSettings: onOpenSettings
            )
            .overlay(alignment: .top) { RefreshBadge(pull: web.pull, refreshing: web.refreshing) }
            .clipped()
            if onList {
                tabBar.transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.22), value: onList)
        .background(Color.cream)
        .overlay { if showChat { chatPanel } }
        #if DEBUG
        .task { if UserDefaults.standard.bool(forKey: "tour") { await runTour() } }
        #endif
    }

    #if DEBUG
    // 개발용 자동 시연 (-tour YES [-tourAssignment 과제id]): 디자인·모션 가이드 영상을 찍으려고
    // 탭 넘김 → 메시지 창 → 당겨서 새로고침 표시 → 문제 화면·문항 이동 → 목록으로
    private func runTour() async {
        func wait(_ s: Double) async { try? await Task.sleep(for: .seconds(s)) }
        await wait(6)
        for t in ["done", "past", "todo"] {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) { web.tab = t }
            web.switchTab(t)
            await wait(1.8)
        }
        withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { showChat = true }
        await wait(2.6)
        closeChat()
        await wait(1)
        for i in 1...10 {
            web.pull = CGFloat(i) / 10
            await wait(0.05)
        }
        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { web.refreshing = true }
        await wait(1.6)
        withAnimation(.easeOut(duration: 0.25)) {
            web.refreshing = false
            web.pull = 0
        }
        await wait(1)
        guard let id = UserDefaults.standard.string(forKey: "tourAssignment") else { return }
        web.open("/student/\(id)")
        await wait(3.5)
        for n in [2, 3, 1] {
            _ = try? await web.webView?.evaluateJavaScript("document.querySelector('[aria-label^=\"\(n)번 문항\"]')?.click()")
            await wait(1.6)
        }
        web.open("/student", tab: web.tab)
    }
    #endif

    // 메시지 창: 💬 바로 아래에 떠 있는 위젯. 키보드가 올라오면 남은 높이에 맞춰 줄어서 입력 칸이 늘 키보드 위에 보인다
    private var chatPanel: some View {
        ZStack(alignment: .topTrailing) {
            // 바깥을 누르면 닫힘 (화면은 어둡게 하지 않고 투명하게 눌림만 받는다)
            Color.clear
                .contentShape(Rectangle())
                .ignoresSafeArea()
                .onTapGesture { closeChat() }
            GeometryReader { geo in
                ChatWidget(server: url, onClose: closeChat)
                    .frame(width: min(400, geo.size.width - 32), height: max(240, min(560, geo.size.height - 80)))
                    .clipShape(RoundedRectangle(cornerRadius: 24))
                    .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.line, lineWidth: 1))
                    .shadow(color: .black.opacity(0.15), radius: 24, y: 10)
                    .padding(.top, 70)
                    .padding(.trailing, 16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .animation(.easeOut(duration: 0.25), value: geo.size.height)
            }
        }
        .transition(.scale(scale: 0.85, anchor: .topTrailing).combined(with: .opacity))
    }

    private func closeChat() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        withAnimation(.spring(response: 0.32, dampingFraction: 0.9)) { showChat = false }
    }

    // 선생님과 메시지: 안 읽은 수 배지 + 누르면 바로 아래로 메시지 창
    private var chatButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) { showChat.toggle() }
            unread = 0
        } label: {
            Image(systemName: "bubble.left.and.text.bubble.right.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.ink)
                .frame(width: 42, height: 42)
                .background(Color.paper, in: Circle())
                .overlay(Circle().stroke(Color.line, lineWidth: 1))
                .overlay(alignment: .topTrailing) {
                    if unread > 0 {
                        Text(unread > 99 ? "99+" : "\(unread)")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Color(hex: 0xE0614A), in: Capsule())
                            .offset(x: 4, y: -4)
                            .transition(.scale.combined(with: .opacity))
                    }
                }
                .symbolEffect(.bounce, value: unread)
        }
        .buttonStyle(.pressable)
        .accessibilityLabel(unread > 0 ? "선생님 메시지 \(unread)개 안 읽음" : "선생님께 메시지")
        #if DEBUG
        // 개발용: 실행 인자 -openChat YES 면 메시지 창을 열어 둔 채로 시작
        .onAppear { if UserDefaults.standard.bool(forKey: "openChat") { showChat = true } }
        #endif
        .onChange(of: showChat) {
            if !showChat { Task { await checkUnread() } }
        }
        .task {
            // 메시지 창이 닫혀 있을 때 15초마다 새 메시지가 왔는지
            while !Task.isCancelled {
                if !showChat { await checkUnread() }
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    private func checkUnread() async {
        guard let n = try? await PulibomAPI.unreadMessages(url) else { return }
        if n != unread { withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { unread = n } }
    }

    private static let tabs: [(id: String, title: String, icon: String)] = [
        ("todo", "지금 풀 과제", "pencil.line"),
        ("done", "다 푼 과제", "checkmark.circle"),
        ("past", "지난 과제", "clock.arrow.circlepath"),
    ]

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(Self.tabs, id: \.id) { t in
                let on = web.tab == t.id
                Button {
                    guard !on else { return }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) { web.tab = t.id }
                    web.switchTab(t.id)
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: t.icon)
                            .font(.system(size: 21, weight: on ? .semibold : .regular))
                            .symbolVariant(on ? .fill : .none)
                        Text(t.title)
                            .font(.caption.weight(on ? .bold : .medium))
                    }
                    .foregroundStyle(on ? Color.ink : Color.muted)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background {
                        // 선택 표시가 고른 탭으로 미끄러져 간다
                        if on {
                            RoundedRectangle(cornerRadius: 16)
                                .fill(Color.honeySoft)
                                .matchedGeometryEffect(id: "pill", in: tabPill)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pressable)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .frame(maxWidth: 640)
        .frame(maxWidth: .infinity)
        .background(Color.paper.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Color.line).frame(height: 1) }
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            if onList {
                HStack(spacing: 8) {
                    Image("Chick").resizable().frame(width: 34, height: 34)
                    (Text("풀이봄") + Text(".").foregroundStyle(Color.honeyDeep))
                        .font(.title3.weight(.heavy))
                        .foregroundStyle(Color.ink)
                }
            } else {
                Button { web.open("/student", tab: web.tab) } label: {
                    Label("과제 목록", systemImage: "chevron.left")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.ink)
                        .padding(.horizontal, 14)
                        .frame(height: 40)
                        .background(Color.paper, in: Capsule())
                        .overlay(Capsule().stroke(Color.line, lineWidth: 1))
                }
                .buttonStyle(.pressable)
            }

            Spacer()

            chatButton

            Menu {
                Section(student.name) {
                    Button("서버 주소 설정", systemImage: "gearshape", action: onOpenSettings)
                    Button("로그아웃", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                        confirmLogout = true
                    }
                }
            } label: {
                HStack(spacing: 10) {
                    Text(student.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.ink)
                    Text(String(student.name.prefix(1)))
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.ink)
                        .frame(width: 34, height: 34)
                        .background(Color.honeySoft, in: Circle())
                        .overlay(Circle().stroke(Color.honey, lineWidth: 1))
                }
                .padding(.leading, 14)
                .padding(.trailing, 4)
                .frame(height: 42)
                .background(Color.paper, in: Capsule())
                .overlay(Capsule().stroke(Color.line, lineWidth: 1))
            }
        }
        .padding(.horizontal, 20)
        .frame(height: 64)
        .overlay {
            // 문제 푸는 중: 가운데에 과제 이름 (수학 1-1 / 일차방정식)
            if !onList, !web.title.isEmpty, web.title != "풀이봄" {
                Text(web.title.replacingOccurrences(of: " · ", with: "  /  "))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                    .frame(maxWidth: 420)
                    .allowsHitTesting(false)
            }
        }
        .background(Color.cream)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.line).frame(height: 1) }
        .confirmationDialog("\(student.name) 학생, 로그아웃할까요?", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("로그아웃", role: .destructive) {
                Task {
                    await PulibomAPI.clearLogin()
                    onLoggedOut()
                }
            }
            Button("취소", role: .cancel) {}
        }
    }
}

// 당겨서 새로고침 표시: 상단 바 바로 아래로 내려오는 작은 알약 (화면은 밀지 않는다)
private struct RefreshBadge: View {
    let pull: CGFloat
    let refreshing: Bool
    @State private var spin = false

    var body: some View {
        HStack(spacing: 8) {
            Image("Chick")
                .resizable()
                .frame(width: 26, height: 26)
                .rotationEffect(.degrees(refreshing ? (spin ? 360 : 0) : Double(pull) * 200))
                .animation(refreshing ? .linear(duration: 0.9).repeatForever(autoreverses: false) : .default, value: spin)
            Text(refreshing ? "새로고침 중…" : pull >= 1 ? "놓으면 새로고침" : "당겨서 새로고침")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.ink)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color.paper, in: Capsule())
        .overlay(Capsule().stroke(Color.line, lineWidth: 1))
        .shadow(color: .black.opacity(0.08), radius: 10, y: 4)
        .scaleEffect(refreshing ? 1 : 0.7 + 0.3 * pull)
        .offset(y: refreshing ? 14 : -56 + 70 * pull)
        .opacity(refreshing ? 1 : Double(pull))
        .allowsHitTesting(false)
        .onChange(of: refreshing) { spin = refreshing }
    }
}
