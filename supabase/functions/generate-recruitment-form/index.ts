/**
 * generate-recruitment-form — Edge Function
 *
 * Recebe título, descrição e requisitos de uma vaga e usa a OpenAI para
 * sugerir um formulário de candidatura com perguntas relevantes.
 *
 * Secret necessário no Supabase Dashboard → Edge Functions → Secrets:
 *   OPENAI_API_KEY = sk-...
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  title: string;
  description?: string;
  requirements?: string;
  department?: string;
  location_type?: string;
}

interface SuggestedQuestion {
  question_text: string;
  question_type: "text" | "single_choice" | "multiple_choice" | "scale_1_5" | "yes_no";
  options: string[] | null;
  correct_answer: string | string[] | null;
  weight: number;
  is_required: boolean;
  sort_order: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY não configurada nos secrets da Edge Function." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RequestBody = await req.json();
    const { title, description, requirements, department, location_type } = body;

    if (!title?.trim()) {
      return new Response(
        JSON.stringify({ error: "O título da vaga é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Você é um especialista em recrutamento e seleção com ampla experiência no mercado brasileiro.
Sua tarefa é criar um formulário de candidatura inteligente e relevante para uma vaga de emprego.

Baseie-se nas melhores práticas do mercado para a função descrita e gere perguntas que:
1. Avaliem competências técnicas específicas da área
2. Identifiquem fit cultural e comportamental
3. Verifiquem experiência e qualificações relevantes
4. Sejam objetivas e fáceis de responder pelo candidato

Retorne APENAS um JSON válido com o seguinte formato (sem markdown, sem explicações):
{
  "questions": [
    {
      "question_text": "texto da pergunta",
      "question_type": "text" | "single_choice" | "multiple_choice" | "scale_1_5" | "yes_no",
      "options": ["opção 1", "opção 2"] | null,
      "correct_answer": "resposta ideal" | ["resp1", "resp2"] | null,
      "weight": 1-10,
      "is_required": true | false,
      "sort_order": 0
    }
  ]
}

Regras:
- Gere entre 8 e 12 perguntas
- Use "single_choice" ou "multiple_choice" quando houver opções definidas (inclua as opções no campo "options")
- Use "yes_no" para perguntas de sim/não
- Use "scale_1_5" para avaliar nível de experiência ou proficiência
- Use "text" para respostas abertas e dissertativas
- O campo "correct_answer" deve conter a resposta ideal/esperada quando aplicável (para scoring automático)
- Peso (weight) de 1 a 10: perguntas técnicas críticas = 8-10, comportamentais = 5-7, informativas = 1-4
- Ordene as perguntas do mais importante para o menos importante`;

    const userPrompt = `Crie um formulário de candidatura para a seguinte vaga:

**Título:** ${title}
${department ? `**Departamento/Área:** ${department}` : ""}
${location_type ? `**Modalidade:** ${location_type}` : ""}
${description ? `\n**Descrição da vaga:**\n${description}` : ""}
${requirements ? `\n**Requisitos:**\n${requirements}` : ""}

Pesquise as melhores práticas do mercado para esta função e crie perguntas que realmente ajudem a identificar os melhores candidatos.`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[generate-recruitment-form] OpenAI error:", errText);
      return new Response(
        JSON.stringify({ error: `Erro na API OpenAI: ${openaiRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Resposta vazia da OpenAI." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed: { questions: SuggestedQuestion[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[generate-recruitment-form] JSON parse error:", content);
      return new Response(
        JSON.stringify({ error: "Resposta da IA em formato inválido." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA não retornou perguntas válidas." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normaliza e garante sort_order sequencial
    const questions: SuggestedQuestion[] = parsed.questions.map((q, i) => ({
      question_text: String(q.question_text ?? "").trim(),
      question_type: (["text", "single_choice", "multiple_choice", "scale_1_5", "yes_no"].includes(q.question_type)
        ? q.question_type
        : "text") as SuggestedQuestion["question_type"],
      options: Array.isArray(q.options) && q.options.length > 0 ? q.options.map(String) : null,
      correct_answer: q.correct_answer ?? null,
      weight: Math.min(10, Math.max(1, Number(q.weight) || 5)),
      is_required: q.is_required !== false,
      sort_order: i,
    }));

    return new Response(
      JSON.stringify({ questions }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[generate-recruitment-form] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
