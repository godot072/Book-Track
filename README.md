# Book Track

나만의 도서 서재 앱 (Netlify 배포용)

## 로컬에서 실행

```bash
npm install
npm run dev
```

## Netlify 배포

### 방법 A — GitHub 연동 (추천)

1. 이 폴더를 GitHub 저장소에 올리세요.
2. [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import an existing project" → 방금 만든 저장소 선택.
3. 빌드 설정은 `netlify.toml`에 이미 들어있어서 자동으로 인식돼요.
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. **Deploy site** 클릭.

### 방법 B — 드래그 앤 드롭 (더 간단, 서버리스 함수는 별도 설정 필요)

1. 로컬에서 `npm install && npm run build` 실행 → `dist` 폴더 생성.
2. [app.netlify.com/drop](https://app.netlify.com/drop)에 `dist` 폴더를 통째로 드래그.
3. 단, 이 방법은 `netlify/functions`가 자동으로 같이 배포되지 않을 수 있어요. 사진 자동 인식 기능까지 쓰려면 **방법 A(GitHub 연동)**를 권장해요.

## AI 기능들 (모두 같은 API 키를 공유해요)

아래 기능은 전부 `netlify/functions/` 안의 서버리스 함수를 통해 동작하고,
**같은** `ANTHROPIC_API_KEY` 환경변수 하나만 등록하면 전부 작동해요.

| 기능 | 함수 파일 | 위치 |
|---|---|---|
| 표지 사진으로 자동 인식 | `recognize-cover.js` | 책 추가/수정 화면 |
| 감상평 다듬기 | `polish-review.js` | 책 추가/수정 화면 |
| 다음 읽을 책 추천 | `recommend-books.js` | 메인 화면 상단 "AI 추천" 버튼 |

### API 키 등록 방법 (필수)

1. [console.anthropic.com](https://console.anthropic.com)에서 API 키를 발급받으세요.
2. Netlify 대시보드 → 사이트 선택 → **Site configuration → Environment variables**
3. **Add a variable** 클릭:
   - Key: `ANTHROPIC_API_KEY`
   - Value: 발급받은 키 값
4. 저장 후, **Deploys 탭에서 "Trigger deploy" → "Clear cache and deploy site"**로 재배포하세요 (환경변수는 재배포해야 반영돼요).

> 키를 등록하지 않으면 사진 업로드 자체는 되지만, 자동 인식은 "인식에 실패했어요" 토스트와 함께 조용히 실패하고 직접 입력하면 돼요. 키 등록 후엔 사진만 올려도 제목·저자·소개·장르가 자동으로 채워져요.

⚠️ API 키는 절대 프론트엔드 코드나 `.env` 파일을 커밋해서 GitHub에 올리지 마세요. 반드시 Netlify의 Environment variables에만 등록하세요.

## 데이터 저장 방식

- 책 목록은 브라우저의 `localStorage`에 저장돼요 (Claude 아티팩트의 저장 기능과 달리, **기기/브라우저마다 따로** 저장돼요. 클라우드 동기화는 없어요).
- 사진은 업로드 시 자동으로 압축되어 함께 저장돼요.

## 카카오톡 공유

"책 추가" 화면 하단의 "카카오톡 등으로 보내기" 버튼은 별도 설정 없이 기기의 기본 공유 시트(Web Share API)를 사용해요. 배포된 사이트가 **https**로 서비스되면(Netlify는 기본적으로 https예요) 정상 작동해요.
