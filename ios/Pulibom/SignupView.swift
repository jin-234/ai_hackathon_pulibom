import SwiftUI

// 학생 회원가입 시트 (웹 /signup 과 같은 내용)
// 선생님께 받은 반 코드 + 번호 + 이름 + 비밀번호 → 그 반 학생으로 바로 들어간다
struct SignupView: View {
    let server: URL
    let onSignup: (LoggedInStudent) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var className: String?
    @State private var codeError: String?
    @State private var number = ""
    @State private var name = ""
    @State private var password = ""
    @State private var password2 = ""
    @State private var error: String?
    @State private var busy = false

    private var mismatch: Bool { !password2.isEmpty && password != password2 }
    private var ready: Bool {
        className != nil && !number.isEmpty && !name.trimmingCharacters(in: .whitespaces).isEmpty && password.count >= 4 && !mismatch
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    section("반 코드", footer: "선생님께 받은 6자리 코드를 넣으면 어느 반인지 보여 줘요.") {
                        FormGroup {
                            FormRow(label: "반 코드", last: true) {
                                TextField("예: K7P2QX", text: $code)
                                    .multilineTextAlignment(.trailing)
                                    .font(.body.monospaced())
                                    .kerning(3)
                                    .textInputAutocapitalization(.characters)
                                    .autocorrectionDisabled()
                                    .onChange(of: code) {
                                        let cleaned = String(code.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(6))
                                        if cleaned != code { code = cleaned }
                                    }
                            }
                        }
                        if let className { Notice(text: className, kind: .ok) }
                        if let codeError { Notice(text: "\(codeError) 코드를 다시 확인해 주세요.") }
                    }

                    section("내 정보") {
                        FormGroup {
                            FormRow(label: "번호") {
                                TextField("7", text: $number)
                                    .multilineTextAlignment(.trailing)
                                    .keyboardType(.numberPad)
                                    .onChange(of: number) {
                                        let cleaned = String(number.filter(\.isNumber).prefix(2))
                                        if cleaned != number { number = cleaned }
                                    }
                            }
                            FormRow(label: "이름", last: true) {
                                TextField("홍길동", text: $name)
                                    .multilineTextAlignment(.trailing)
                                    .textContentType(.name)
                                    .onChange(of: name) { if name.count > 20 { name = String(name.prefix(20)) } }
                            }
                        }
                    }

                    section("비밀번호", footer: "숫자 4~8자리. 다음부터는 로그인 화면에서 반·번호를 고르고 이 비밀번호를 넣으면 돼요.") {
                        FormGroup {
                            FormRow(label: "비밀번호") {
                                SecureField("숫자 4~8자리", text: $password)
                                    .multilineTextAlignment(.trailing)
                                    .keyboardType(.numberPad)
                                    .textContentType(.newPassword)
                                    .onChange(of: password) {
                                        let cleaned = String(password.filter(\.isNumber).prefix(8))
                                        if cleaned != password { password = cleaned }
                                    }
                            }
                            FormRow(label: "확인", last: true) {
                                SecureField("한 번 더", text: $password2)
                                    .multilineTextAlignment(.trailing)
                                    .keyboardType(.numberPad)
                                    .textContentType(.newPassword)
                                    .onChange(of: password2) {
                                        let cleaned = String(password2.filter(\.isNumber).prefix(8))
                                        if cleaned != password2 { password2 = cleaned }
                                    }
                            }
                        }
                        if mismatch { Notice(text: "비밀번호가 서로 달라요.") }
                    }

                    if let error { Notice(text: error) }

                    PrimaryButton(title: busy ? "가입하는 중…" : "가입하고 과제 보러 가기", busy: busy, disabled: !ready) {
                        Task { await submit() }
                    }
                }
                .padding(28)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.cream)
            .navigationTitle("회원가입")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("취소") { dismiss() }
                        .foregroundStyle(Color.ink)
                }
            }
        }
        // 코드 6자리를 다 넣으면 어느 반인지 보여 준다
        .task(id: code) {
            className = nil
            codeError = nil
            guard code.count == 6 else { return }
            do {
                className = try await PulibomAPI.joinClassName(server, code: code)
            } catch {
                if !Task.isCancelled { codeError = error.localizedDescription }
            }
        }
    }

    private func section(_ title: String, footer: String? = nil, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.muted)
                .padding(.leading, 6)
            content()
            if let footer {
                Text(footer)
                    .font(.footnote)
                    .foregroundStyle(Color.muted)
                    .padding(.horizontal, 6)
            }
        }
    }

    private func submit() async {
        guard password == password2 else { return error = "비밀번호가 서로 달라요." }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let s = try await PulibomAPI.signup(server, code: code, number: Int(number) ?? 0, name: name.trimmingCharacters(in: .whitespaces), password: password)
            onSignup(s)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
