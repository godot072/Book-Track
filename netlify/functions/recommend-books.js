// Netlify Function: /.netlify/functions/recommend-books
//
// 내 서재의 책 목록(제목/저자/장르/별점/상태)을 바탕으로
// 아직 서재에 없는 새로운 책 4권을 추천받습니다.

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

  const books = Array.isArray(body.books) ? body.books : [];
  if (books.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "서재에 책이 있어야 추천할 수 있어요." }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "서버에 ANTHROPIC_API_KEY 환경변수가 설정되어 있지 않아요." }),
    };
  }

  const summary = books
    .slice(0, 60)
    .map((b) => {
      const parts = [`${b.title}${b.author ? " - " + b.author : ""}`];
      if (b.genre) parts.push(`장르:${b.genre}`);
      if (b.status) parts.push(`상태:${b.status}`);
      if (b.rating) parts.push(`별점:${b.rating}/5`);
      if (b.recommend) parts.push("추천함");
      return "- " + parts.join(" / ");
    })
    .join("\n");

  const prompt = `아래는 내 서재에 있는 책 목록이야.

${summary}

이 목록의 장르·취향·별점·추천 표시를 참고해서, 아직 이 목록에 없는 책 중에서 다음에 읽으면 좋을 책 4권을 추천해줘. 왜 추천하는지 이 사람의 취향과 연결지어 한국어로 1~2문장씩 이유를 적어줘.
반드시 아래 JSON 형식으로만 답하고, 그 외의 설명이나 코드블록 표시는 절대 포함하지 마.
{"recommendations":[{"title":"","author":"","reason":""}]}`;

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
        max_tokens: 1200,
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
      return { statusCode: 502, body: JSON.stringify({ error: "추천 결과를 해석하지 못했어요." }) };
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
