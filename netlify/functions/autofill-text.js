// Netlify Function: /.netlify/functions/autofill-text
//
// 표지 사진 없이, 제목/저자만으로 저자 소개·도서 소개·장르를 채워줍니다.
// ANTHROPIC_API_KEY 환경변수가 필요해요 (recognize-cover.js와 동일).

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "잘못된 요청이에요." }) };
  }

  const title = (body.title || "").trim();
  const author = (body.author || "").trim();
  if (!title) {
    return { statusCode: 400, body: JSON.stringify({ error: "책 제목을 먼저 입력해 주세요." }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "서버에 ANTHROPIC_API_KEY 환경변수가 설정되어 있지 않아요." }),
    };
  }

  const prompt = `다음 책에 대한 정보를 알려줘.
제목: ${title}
저자: ${author || "(모름)"}

저자 소개(authorBio, 한국어 2~3문장), 도서 소개(description, 한국어 3~4문장), 장르(genre, 쉼표로 구분된 1~3개 태그), 그리고 저자를 모른다면 저자 이름(author)도 추정해서 알려줘.
반드시 아래 JSON 형식으로만 답하고, 그 외의 설명이나 코드블록 표시는 절대 포함하지 마.
{"author":"","authorBio":"","description":"","genre":""}
확실하지 않은 책이면 알고 있는 선에서 최대한 답하고, 정말 모르면 해당 값은 빈 문자열로 둬.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: (data && data.error && data.error.message) || "Anthropic API 호출에 실패했어요." }),
      };
    }

    const textBlock = (data.content || []).find((b) => b.type === "text");
    const raw = textBlock ? textBlock.text : "";
    const clean = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ error: "결과를 해석하지 못했어요." }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "서버 오류가 발생했어요." }) };
  }
};
