// Netlify Function: /.netlify/functions/recognize-cover
//
// 프론트엔드에서 표지 사진(base64)을 받아 Anthropic API로 분석하고,
// 제목/저자/저자 소개/도서 소개/장르를 JSON으로 뽑아서 돌려줍니다.
//
// ANTHROPIC_API_KEY는 여기(서버)에서만 사용되고 브라우저로는 절대 내려가지 않아요.
// Netlify 사이트 설정 > Environment variables 에 ANTHROPIC_API_KEY를 등록해야 동작합니다.

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

  const { base64, mediaType } = body;
  if (!base64) {
    return { statusCode: 400, body: JSON.stringify({ error: "이미지 데이터가 없어요." }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "서버에 ANTHROPIC_API_KEY 환경변수가 설정되어 있지 않아요. Netlify 사이트 설정에서 등록해 주세요.",
      }),
    };
  }

  const prompt = `이 이미지는 책 표지 사진이야. 제목(title), 저자(author), 저자 소개(authorBio, 한국어 2~3문장), 도서 소개(description, 한국어 3~4문장), 장르(genre, 쉼표로 구분된 1~3개 태그)를 알아내줘. 반드시 아래 JSON 형식으로만 답하고, 그 외의 설명이나 코드블록 표시는 절대 포함하지 마.
{"title":"","author":"","authorBio":"","description":"","genre":""}
확실하지 않거나 읽어낼 수 없는 값은 빈 문자열로 둬.`;

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
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
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
      return { statusCode: 502, body: JSON.stringify({ error: "인식 결과를 해석하지 못했어요." }) };
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
