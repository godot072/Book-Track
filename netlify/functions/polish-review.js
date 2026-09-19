// Netlify Function: /.netlify/functions/polish-review
//
// 사용자가 쓴 감상평을 자연스럽게 다듬어줍니다. 내용/의견은 바꾸지 않고
// 문장만 다듬는 것이 목표예요.

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

  const review = (body.review || "").trim();
  const title = (body.title || "").trim();
  if (!review) {
    return { statusCode: 400, body: JSON.stringify({ error: "다듬을 감상평이 없어요." }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "서버에 ANTHROPIC_API_KEY 환경변수가 설정되어 있지 않아요." }),
    };
  }

  const prompt = `아래는 "${title || "이 책"}"에 대한 내 감상평 초안이야. 내용이나 의견, 평가는 절대 바꾸지 말고, 어색한 문장이나 맞춤법만 자연스럽게 다듬어줘. 너무 formal하게 바꾸지 말고 원래 말투(반말/존댓말 등)는 유지해줘. 다듬은 감상평 텍스트만 출력하고, 다른 설명이나 따옴표는 붙이지 마.

[원본]
${review}`;

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
    const polished = (textBlock ? textBlock.text : "").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ polished }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "서버 오류가 발생했어요." }) };
  }
};
