/**
 * Vercel serverless function – fetches YouTube captions via the public
 * timedtext API and returns plain text.  Runs at the Vercel edge, so
 * YouTube sees Vercel's IP (not Render's blocked datacenter IP).
 *
 * POST body: { videoId: string, language?: string }
 * Response:  { transcript: string }  |  { error: string }
 */

// Language mapping (same codes as the Python backend)
const LANG_MAP = {
    english: "en",
    hinglish: "hi",
    hindi: "hi",
    spanish: "es",
    french: "fr",
    german: "de",
    japanese: "ja",
    korean: "ko",
    portuguese: "pt",
    russian: "ru",
    chinese: "zh",
    arabic: "ar",
};

export default async function handler(req) {
    // Only POST
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const { videoId, language = "english" } = body || {};

    if (!videoId || typeof videoId !== "string" || videoId.length !== 11) {
        return new Response(
            JSON.stringify({ error: "Invalid or missing videoId (must be 11-char YouTube ID)" }),
            {
                status: 400,
                headers: { "Content-Type": "application/json" },
            }
        );
    }

    const langCode = LANG_MAP[language.toLowerCase()] || "en";

    console.log(`Fetching transcript for ${videoId} (lang: ${langCode})`);

    try {
        // YouTube's public timedtext API – no auth, no cookies, no anti-bot
        const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${langCode}&fmt=srv3`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

        const resp = await fetch(timedtextUrl, {
            signal: controller.signal,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "Accept-Language": `${langCode},en;q=0.9`,
            },
        });

        clearTimeout(timeout);

        if (!resp.ok) {
            console.error(`YouTube timedtext returned HTTP ${resp.status}`);
            return new Response(
                JSON.stringify({ error: `YouTube returned HTTP ${resp.status}` }),
                {
                    status: 502,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        const xmlText = await resp.text();

        if (!xmlText || xmlText.length < 50) {
            // A valid transcript XML is at least a few hundred bytes
            return new Response(
                JSON.stringify({ error: "Empty or too-short transcript response from YouTube" }),
                {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Simple XML text extraction via regex (no heavy XML parser needed)
        // Each caption line is inside <text ...>...</text>
        const textMatches = xmlText.match(/<text[^>]*>([^<]*)<\/text>/gs);

        if (!textMatches || textMatches.length === 0) {
            console.error("No <text> elements found in timedtext response");
            return new Response(
                JSON.stringify({ error: "No captions found for this video" }),
                {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Extract inner text, decode HTML entities, join with spaces
        const transcript = textMatches
            .map((t) => {
                const inner = t.replace(/<text[^>]*>/, "").replace(/<\/text>/, "");
                // Decode common HTML entities
                return inner
                    .replace(/&/g, "&")
                    .replace(/</g, "<")
                    .replace(/>/g, ">")
                    .replace(/"/g, '"')
                    .replace(/'/g, "'");
            })
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

        if (!transcript) {
            return new Response(
                JSON.stringify({ error: "Empty transcript after parsing" }),
                {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        const wordCount = transcript.split(/\s+/).length;
        console.log(`Transcript fetched: ${wordCount} words, ${transcript.length} chars`);

        return new Response(
            JSON.stringify({ transcript }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (err) {
        if (err.name === "AbortError") {
            console.error("YouTube timedtext request timed out");
            return new Response(
                JSON.stringify({ error: "Request to YouTube timed out" }),
                {
                    status: 504,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }
        console.error(`Transcript fetch error: ${err.message}`);
        return new Response(
            JSON.stringify({ error: `Failed to fetch transcript: ${err.message}` }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
}