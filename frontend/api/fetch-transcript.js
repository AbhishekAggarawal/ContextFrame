/**
 * Vercel serverless function – fetches YouTube captions via the InnerTube API
 * (same approach used by the youtube-transcript-api Python library).
 * Runs at the Vercel edge, so YouTube sees Vercel's IP (not Render's blocked IP).
 *
 * Mechanism (4-step):
 *  1. GET YouTube watch page → extract INNERTUBE_API_KEY from HTML
 *  2. POST InnerTube API (/youtubei/v1/player) with ANDROID client context
 *  3. Extract caption track baseUrl from InnerTube response (filter by language)
 *  4. GET baseUrl → parse XML <text> elements → return plain text
 *
 * POST body: { videoId: string, language?: string }
 * Response:  { transcript: string }  |  { error: string }
 */

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

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ANDROID client context – YouTube serves captions to mobile clients
const INNERTUBE_CONTEXT = {
    client: {
        clientName: "ANDROID",
        clientVersion: "20.10.38",
        androidSdkVersion: 33,
        hl: "en",
        gl: "US",
    },
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
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    const langCode = LANG_MAP[language.toLowerCase()] || "en";
    console.log(`Fetching transcript for ${videoId} (lang: ${langCode})`);

    try {
        // ═══════════════════════════════════════════════════════════════
        // STEP 1: GET YouTube watch page → extract INNERTUBE_API_KEY
        // ═══════════════════════════════════════════════════════════════
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log(`  Step 1/4: Fetching watch page…`);

        const watchResp = await fetch(watchUrl, {
            headers: {
                "User-Agent": UA,
                "Accept-Language": "en-US,en;q=0.9",
            },
        });

        if (!watchResp.ok) {
            console.error(`  ✗ Watch page returned HTTP ${watchResp.status}`);
            return new Response(
                JSON.stringify({ error: `YouTube watch page returned HTTP ${watchResp.status}` }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }

        const html = await watchResp.text();

        // Extract INNERTUBE_API_KEY from inline JS config
        // Pattern: "INNERTUBE_API_KEY":"KEY"  (with optional whitespace around colon)
        const apiKeyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([a-zA-Z0-9_-]+)"/);
        if (!apiKeyMatch || !apiKeyMatch[1]) {
            console.error("  ✗ Could not extract INNERTUBE_API_KEY from watch page");
            return new Response(
                JSON.stringify({ error: "Could not extract INNERTUBE_API_KEY from YouTube page" }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }
        const apiKey = apiKeyMatch[1];
        console.log(`  ✓ API key extracted: ${apiKey.substring(0, 8)}…`);

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: POST InnerTube API → get player response with captions
        // ═══════════════════════════════════════════════════════════════
        const innertubeUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
        console.log(`  Step 2/4: POST InnerTube API…`);

        const innertubeResp = await fetch(innertubeUrl, {
            method: "POST",
            headers: {
                "User-Agent": UA,
                "Content-Type": "application/json",
                "Accept-Language": "en-US,en;q=0.9",
            },
            body: JSON.stringify({
                context: INNERTUBE_CONTEXT,
                videoId: videoId,
            }),
        });

        if (!innertubeResp.ok) {
            console.error(`  ✗ InnerTube API returned HTTP ${innertubeResp.status}`);
            return new Response(
                JSON.stringify({ error: `InnerTube API returned HTTP ${innertubeResp.status}` }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }

        const innertubeData = await innertubeResp.json();

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: Extract caption track baseUrl
        // ═══════════════════════════════════════════════════════════════
        const captions = innertubeData?.captions?.playerCaptionsTracklistRenderer;
        if (!captions || !captions.captionTracks || captions.captionTracks.length === 0) {
            console.error("  ✗ No captions in InnerTube response");
            return new Response(
                JSON.stringify({ error: "No captions available for this video" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        console.log(
            `  Available tracks: ${captions.captionTracks.map((t) => t.languageCode).join(", ")}`
        );

        // Find matching track: prefer exact languageCode match, then prefix match
        // (e.g., "en" matches "en-US", "hi" matches "hi-IN")
        let track = captions.captionTracks.find((t) => t.languageCode === langCode);
        if (!track) {
            track = captions.captionTracks.find(
                (t) => t.languageCode && t.languageCode.startsWith(langCode)
            );
        }
        if (!track) {
            const available = captions.captionTracks.map((t) => t.languageCode).join(", ");
            console.error(`  ✗ No track for "${langCode}". Available: ${available}`);
            return new Response(
                JSON.stringify({
                    error: `No captions found for "${langCode}". Available: ${available}`,
                }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        const baseUrl = track.baseUrl;
        if (!baseUrl) {
            console.error("  ✗ Caption track has no baseUrl");
            return new Response(
                JSON.stringify({ error: "Caption track has no baseUrl" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        console.log(
            `  ✓ Selected track: ${track.languageCode} (${track.name?.simpleText || track.name?.runs?.[0]?.text || "unknown"})`
        );

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: GET baseUrl → parse XML <text> elements → extract text
        // ═══════════════════════════════════════════════════════════════
        console.log(`  Step 4/4: Fetching caption XML…`);
        const xmlResp = await fetch(baseUrl, {
            headers: {
                "User-Agent": UA,
                "Accept-Language": "en-US,en;q=0.9",
            },
        });

        if (!xmlResp.ok) {
            console.error(`  ✗ Caption XML returned HTTP ${xmlResp.status}`);
            return new Response(
                JSON.stringify({ error: `Caption XML fetch returned HTTP ${xmlResp.status}` }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }

        const xmlText = await xmlResp.text();

        if (!xmlText || xmlText.length < 50) {
            console.error("  ✗ Empty or too-short caption XML");
            return new Response(
                JSON.stringify({ error: "Empty or too-short caption XML response" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Parse <text> elements via regex
        const textMatches = xmlText.match(/<text[^>]*>([^<]*)<\/text>/gs);

        if (!textMatches || textMatches.length === 0) {
            console.error("  ✗ No <text> elements found in caption XML");
            return new Response(
                JSON.stringify({ error: "No <text> elements found in caption XML" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Extract inner text, decode HTML entities, join with spaces
        const transcript = textMatches
            .map((t) => {
                const inner = t.replace(/<text[^>]*>/, "").replace(/<\/text>/, "");
                // Decode standard HTML entities (order matters: & first)
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
            console.error("  ✗ Empty transcript after parsing");
            return new Response(
                JSON.stringify({ error: "Empty transcript after XML parsing" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        const wordCount = transcript.split(/\s+/).length;
        console.log(`  ✓ Transcript: ${wordCount} words, ${transcript.length} chars`);

        return new Response(JSON.stringify({ transcript }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        if (err.name === "AbortError") {
            console.error("Request timed out");
            return new Response(
                JSON.stringify({ error: "Request to YouTube timed out" }),
                { status: 504, headers: { "Content-Type": "application/json" } }
            );
        }
        console.error(`Transcript fetch error: ${err.message}`);
        return new Response(
            JSON.stringify({ error: `Failed to fetch transcript: ${err.message}` }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}