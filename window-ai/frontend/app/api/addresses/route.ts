import { NextRequest, NextResponse } from "next/server";
import {
  parseGoogleAddress,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";

const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1";
const PLACE_FIELDS = "addressComponents,formattedAddress";

function googleHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
  };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Address autocomplete is not configured" },
      { status: 503 },
    );
  }

  const query = request.nextUrl.searchParams.get("q")?.trim();
  const placeId = request.nextUrl.searchParams.get("placeId")?.trim();

  try {
    if (placeId) {
      const response = await fetch(
        `${GOOGLE_PLACES_URL}/places/${encodeURIComponent(placeId)}`,
        {
          headers: {
            ...googleHeaders(apiKey),
            "X-Goog-FieldMask": PLACE_FIELDS,
          },
        },
      );
      if (!response.ok) {
        throw new Error("Unable to retrieve that address");
      }
      return NextResponse.json({ data: parseGoogleAddress(await response.json()) });
    }

    if (!query || query.length < 3) {
      return NextResponse.json({ data: [] });
    }

    const response = await fetch(`${GOOGLE_PLACES_URL}/places:autocomplete`, {
      method: "POST",
      headers: googleHeaders(apiKey),
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["ca"],
        languageCode: "en",
      }),
    });
    if (!response.ok) {
      throw new Error("Unable to look up addresses");
    }

    const payload = (await response.json()) as {
      suggestions?: Array<{
        placePrediction?: { placeId?: string; text?: { text?: string } };
      }>;
    };
    const suggestions: AddressSuggestion[] = (payload.suggestions ?? []).flatMap(
      (suggestion) => {
        const prediction = suggestion.placePrediction;
        if (!prediction?.placeId || !prediction.text?.text) return [];
        return [{ placeId: prediction.placeId, label: prediction.text.text }];
      },
    );

    return NextResponse.json({ data: suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Address lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
