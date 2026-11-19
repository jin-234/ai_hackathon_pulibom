import SwiftUI

// 앱을 켜면 나오는 학생 로그인
// 가로: 왼쪽 병아리·환영 문구 / 오른쪽 입력. 세로: 위아래로
// 아이패드 한 대를 여러 학생이 돌려 써도 누가 푸는지 남도록, 앱을 켤 때마다 새로 로그인한다
struct LoginView: View {
    let server: URL
    let onLogin: (LoggedInStudent) -> Void
    let onOpenSettings: () -> Void
    var logo: Namespace.ID? = nil // 시작 화면 병아리와 이어지게
    var splashing = false

    @State private var students: [Student] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var classId = ""
    @State private var studentId = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false
    @State private var showSignup = false
    @FocusState private var passwordFocused: Bool

    // 웹 로그인과 같이: 반을 먼저 고르고 → 그 반 학생 중에서 번호를 고른다
    private var classes: [(id: String, name: String)] {
        var seen = Set<String>()
        return students.filter { seen.insert($0.classId).inserted }.map { ($0.classId, $0.className) }
    }

    private var inClass: [Student] { students.filter { $0.classId == classId } }
    private var selected: Student? { students.first { $0.id == studentId } }

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width > geo.size.height
            // 세로 화면에서 비밀번호를 칠 땐 병아리 영역을 줄여서 키보드에 칸이 가리지 않게
            let compact = !wide && passwordFocused
            ZStack(alignment: .topTrailing) {
                Color.cream.ignoresSafeArea()

                if wide {
                    HStack(spacing: 0) {
                        hero(big: true)
                            .frame(width: geo.size.width * 0.44)
                        formSide
                            .frame(maxWidth: .infinity)
                    }
                } else {
                    VStack(spacing: 0) {
                        hero(big: false)
                            .frame(height: compact ? 0 : geo.size.height * 0.34)
                            .clipped()
                            .opacity(compact ? 0 : 1)
                        formSide
                    }
                    .animation(.easeInOut(duration: 0.25), value: compact)
                }

                Button(action: onOpenSettings) {
                    Image(systemName: "gearshape")
                        .font(.title3)
                        .foregroundStyle(Color.muted)
                        .frame(width: 44, height: 44)
                }
                .padding(12)
                .accessibilityLabel("서버 주소 설정")
            }
        }
        .task { await load() }
        .sheet(isPresented: $showSignup) {
            SignupView(server: server, onSignup: { s in
                showSignup = false
                onLogin(s)
            })
        }
    }

    // 병아리 + 환영 문구
    private func hero(big: Bool) -> some View {
        ZStack {
            LinearGradient(colors: [Color.honeySoft, Color.honey.opacity(0.55)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            VStack(spacing: big ? 18 : 10) {
                Image("Chick")
                    .resizable()
                    .frame(width: big ? 180 : 110, height: big ? 180 : 110)
                    .matchedLogo(logo, isSource: !splashing)
                    .shadow(color: Color.honeyDeep.opacity(0.35), radius: 16, y: 10)
                    .bobbing()
                (Text("풀이봄") + Text(".").foregroundStyle(Color.honeyDeep))
                    .font(.system(size: big ? 44 : 32, weight: .heavy))
                    .foregroundStyle(Color.ink)
                Text("풀이를 모아, 배움을 잇다")
                    .font(big ? .title3 : .body)
                    .foregroundStyle(Color.olive)
            }
            .padding(24)
        }
    }

    private var formSide: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("로그인")
                        .font(.largeTitle.bold())
                        .foregroundStyle(Color.ink)
                    Text("반과 번호를 고르고 비밀번호를 넣어 주세요.")
                        .foregroundStyle(Color.muted)
                }
                .riseIn()

                if loading {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("학생 명단 불러오는 중…").foregroundStyle(Color.muted)
                    }
                    .frame(maxWidth: .infinity, minHeight: 180)
                } else if let loadError {
                    loadErrorView(loadError)
                } else {
                    form.riseIn(delay: 0.08)
                }
            }
            .frame(maxWidth: 440)
            .padding(.horizontal, 32)
            .padding(.vertical, 56)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 16) {
            FormGroup {
                FormRow(label: "반") {
                    Menu {
                        Picker("반", selection: Binding(get: { classId }, set: { pickClass($0) })) {
                            ForEach(classes, id: \.id) { Text($0.name).tag($0.id) }
                        }
                    } label: {
                        MenuValue(text: classes.first { $0.id == classId }?.name ?? "선택")
                    }
                }
                FormRow(label: "번호") {
                    Menu {
                        Picker("번호", selection: $studentId) {
                            ForEach(inClass) { Text(label(for: $0)).tag($0.id) }
                        }
                    } label: {
                        MenuValue(text: selected.map(label(for:)) ?? "선택")
                    }
                }
                FormRow(label: "비밀번호", last: true) {
                    SecureField("숫자", text: $password)
                        .multilineTextAlignment(.trailing)
                        .keyboardType(.numberPad)
                        .textContentType(.password)
                        .focused($passwordFocused)
                        .onChange(of: password) {
                            error = nil
                            let cleaned = String(password.filter(\.isNumber).prefix(8))
                            if cleaned != password { password = cleaned }
                        }
                        .onSubmit { Task { await login() } }
                }
            }
            .onChange(of: studentId) { error = nil }

            if let error { Notice(text: error) }

            PrimaryButton(title: busy ? "들어가는 중…" : "과제 풀러 가기", busy: busy, disabled: password.isEmpty) {
                Task { await login() }
            }

            HStack(spacing: 4) {
                Text("처음 왔나요?").foregroundStyle(Color.muted)
                Button("반 코드로 회원가입") { showSignup = true }
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.honeyDeep)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 4)

            VStack(spacing: 6) {
                Button("로그인 건너뛰고 둘러보기") { Task { await login(skip: true) } }
                    .font(.footnote)
                    .foregroundStyle(Color.muted)
                    .disabled(busy)
                (Text("데모 계정 · 학생 번호 선택 후 ") + Text("0000").bold())
                    .font(.caption)
                    .foregroundStyle(Color.muted.opacity(0.8))
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 20)
        }
    }

    // 번호만 보여 준다 (명단에서 다른 친구 이름이 보이지 않게)
    private func label(for s: Student) -> String {
        "\(s.number.map(String.init) ?? "-")번"
    }

    private func pickClass(_ id: String) {
        classId = id
        studentId = inClass.first?.id ?? ""
        error = nil
    }

    private func loadErrorView(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Notice(text: "풀이봄 서버에 연결할 수 없어요. \(message)")
            Text(server.absoluteString)
                .font(.callout.monospaced())
                .foregroundStyle(Color.muted)
            HStack(spacing: 12) {
                Button("서버 주소 바꾸기", action: onOpenSettings)
                    .buttonStyle(.bordered)
                Button("다시 시도") { Task { await load() } }
                    .buttonStyle(.borderedProminent)
            }
            .tint(Color.ink)
        }
    }

    private func load() async {
        loading = true
        loadError = nil
        await PulibomAPI.clearLogin()
        do {
            students = try await PulibomAPI.roster(server)
            if selected == nil {
                classId = students.first?.classId ?? ""
                studentId = students.first?.id ?? ""
            }
        } catch {
            loadError = error.localizedDescription
        }
        loading = false
        #if DEBUG
        // 개발용: 실행 인자 -demoLogin YES 면 로그인을 건너뛰고 바로 들어간다 (시뮬레이터 화면 확인용)
        if loadError == nil, UserDefaults.standard.bool(forKey: "demoLogin") { await login(skip: true) }
        // -loginId s01 -loginPassword 0000 이면 그 학생으로 바로 로그인
        if loadError == nil, let id = UserDefaults.standard.string(forKey: "loginId"), let pw = UserDefaults.standard.string(forKey: "loginPassword") {
            studentId = id
            password = pw
            await login()
        }
        #endif
    }

    private func login(skip: Bool = false) async {
        guard !busy else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let s = try await PulibomAPI.login(server, studentId: skip ? nil : studentId, password: skip ? "" : password, skip: skip)
            passwordFocused = false
            onLogin(s)
        } catch {
            self.error = error.localizedDescription
            password = ""
        }
    }
}
