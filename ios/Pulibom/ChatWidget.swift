import SwiftUI

// 선생님과 메시지: 상단 바 💬 를 누르면 그 아래로 뜨는 작은 창 (StudentShellView 의 chatPanel)
// 열려 있는 동안 4초마다 새 메시지를 가져온다. 선생님 쪽은 웹 학생 상세의 '메시지' 탭
struct ChatWidget: View {
    let server: URL
    var onClose: (() -> Void)? = nil

    @State private var messages: [ChatMessage] = []
    @State private var loaded = false
    @State private var text = ""
    @State private var sending = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(Color.line).frame(height: 1)
            list
            Rectangle().fill(Color.line).frame(height: 1)
            input
        }
        .background(Color.cream)
        .task {
            // 열려 있는 동안 계속 새로 고침 (창을 닫으면 task 가 끝난다)
            while !Task.isCancelled {
                await refresh()
                try? await Task.sleep(for: .seconds(4))
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image("Chick").resizable().frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text("선생님께 메시지").font(.headline).foregroundStyle(Color.ink)
                Text("궁금한 점을 편하게 물어보세요").font(.caption).foregroundStyle(Color.muted)
            }
            Spacer()
            if let onClose {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Color.muted)
                        .frame(width: 30, height: 30)
                        .background(Color.sand, in: Circle())
                }
                .buttonStyle(.pressable)
                .accessibilityLabel("닫기")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.paper)
    }

    private var list: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if loaded && messages.isEmpty && error == nil {
                        VStack(spacing: 8) {
                            Image("Chick").resizable().frame(width: 56, height: 56).bobbing()
                            Text("아직 주고받은 메시지가 없어요.\n모르는 문제나 궁금한 점을 보내 보세요!")
                                .font(.footnote)
                                .multilineTextAlignment(.center)
                                .foregroundStyle(Color.muted)
                        }
                        .padding(.top, 60)
                    }
                    ForEach(messages) { m in
                        bubble(m).id(m.id)
                            .transition(.asymmetric(insertion: .scale(scale: 0.85, anchor: m.mine ? .bottomTrailing : .bottomLeading).combined(with: .opacity), removal: .opacity))
                    }
                    if let error { Notice(text: error).padding(.top, 8) }
                }
                .padding(14)
            }
            .onChange(of: messages.last?.id) {
                if let last = messages.last?.id { withAnimation { proxy.scrollTo(last, anchor: .bottom) } }
            }
            // 키보드가 올라와 창이 줄어들어도 마지막 메시지가 보이게
            .onChange(of: focused) {
                guard focused, let last = messages.last?.id else { return }
                Task {
                    try? await Task.sleep(for: .seconds(0.3))
                    withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .onAppear {
                if let last = messages.last?.id { proxy.scrollTo(last, anchor: .bottom) }
            }
        }
    }

    private func bubble(_ m: ChatMessage) -> some View {
        HStack {
            if m.mine { Spacer(minLength: 48) }
            VStack(alignment: m.mine ? .trailing : .leading, spacing: 3) {
                if !m.mine {
                    Text(m.senderName).font(.caption2).foregroundStyle(Color.muted).padding(.horizontal, 4)
                }
                Text(m.body)
                    .font(.subheadline)
                    .foregroundStyle(Color.ink)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .background(m.mine ? Color.honey : Color.paper, in: BubbleShape(mine: m.mine))
                    .overlay { if !m.mine { BubbleShape(mine: false).stroke(Color.line, lineWidth: 1) } }
                // 선생님이 보낸 영상 링크·학습 자료: 누르면 유튜브 앱이나 Safari 에서 열린다
                ForEach(m.attachments ?? [], id: \.self) { a in
                    attachmentLink(a)
                }
                Text(time(m.createdAt) + (m.mine && m.readAt != nil ? " · 읽음" : ""))
                    .font(.caption2)
                    .foregroundStyle(Color.muted)
                    .padding(.horizontal, 4)
            }
            if !m.mine { Spacer(minLength: 48) }
        }
    }

    @ViewBuilder
    private func attachmentLink(_ a: ChatAttachment) -> some View {
        if let url = URL(string: a.url, relativeTo: server)?.absoluteURL {
            Link(destination: url) {
                HStack(spacing: 8) {
                    Image(systemName: a.kind == "file" ? "doc.fill" : (a.youtubeId != nil ? "play.rectangle.fill" : "link"))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(a.youtubeId != nil ? Color.red : Color.honeyDeep)
                    Text(attachmentLabel(a))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.ink)
                        .lineLimit(1)
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color.muted)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.line, lineWidth: 1))
            }
            .accessibilityLabel(attachmentLabel(a))
        }
    }

    private func attachmentLabel(_ a: ChatAttachment) -> String {
        if a.kind == "file" { return "📎 " + (a.name ?? "파일") }
        if a.youtubeId != nil { return "유튜브 영상 보기" }
        return URL(string: a.url)?.host() ?? a.url
    }

    private var input: some View {
        HStack(spacing: 8) {
            TextField("선생님께 보낼 말", text: $text, axis: .vertical)
                .lineLimit(1...4)
                .font(.body)
                .foregroundStyle(Color.ink)
                .tint(Color.honeyDeep)
                .focused($focused)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.line, lineWidth: 1))
                .onSubmit { Task { await send() } }
            Button {
                Task { await send() }
            } label: {
                Image(systemName: sending ? "ellipsis.circle.fill" : "arrow.up.circle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(canSend ? Color.honeyDeep : Color.line)
                    .symbolEffect(.pulse, isActive: sending)
            }
            .buttonStyle(.pressable)
            .disabled(!canSend)
            .accessibilityLabel("보내기")
        }
        .padding(12)
        .background(Color.paper)
    }

    private var canSend: Bool { !sending && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private func refresh() async {
        do {
            let next = try await PulibomAPI.messages(server)
            if next != messages { withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { messages = next } }
            if error != nil { error = nil }
        } catch {
            self.error = error.localizedDescription.contains("로그인") ? "둘러보기 중에는 메시지를 쓸 수 없어요. 내 번호로 로그인해 주세요." : error.localizedDescription
        }
        loaded = true
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        do {
            let m = try await PulibomAPI.sendMessage(server, body: body)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { messages.append(m) }
            text = ""
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func time(_ ms: Double) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = Calendar.current.isDateInToday(Date(timeIntervalSince1970: ms / 1000)) ? "a h:mm" : "M/d a h:mm"
        return f.string(from: Date(timeIntervalSince1970: ms / 1000))
    }
}

// 말풍선: 보낸 쪽 아래 모서리만 덜 둥글게
struct BubbleShape: Shape {
    let mine: Bool

    func path(in rect: CGRect) -> Path {
        let big: CGFloat = 16, small: CGFloat = 5
        return Path(roundedRect: rect, cornerRadii: RectangleCornerRadii(
            topLeading: big,
            bottomLeading: mine ? big : small,
            bottomTrailing: mine ? small : big,
            topTrailing: big
        ))
    }
}
