export interface CurrentConditions {
  temperatureC: number;
  windSpeedKph: number;
  windGustsKph: number;
  precipitationMm: number;
  description: string;
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    precipitation: number;
    weather_code: number;
  };
}

// WMO Weather interpretation codes (open-meteo.com/en/docs)
const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "heavy freezing rain",
  71: "slight snow fall",
  73: "moderate snow fall",
  75: "heavy snow fall",
  77: "snow grains",
  80: "slight rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  85: "slight snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with slight hail",
  99: "thunderstorm with heavy hail",
};

export async function getCurrentConditions(lat: number, lng: number): Promise<CurrentConditions> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "current",
    "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,weather_code"
  );

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as OpenMeteoResponse;
  const { temperature_2m, wind_speed_10m, wind_gusts_10m, precipitation, weather_code } =
    data.current;

  return {
    temperatureC: temperature_2m,
    windSpeedKph: wind_speed_10m,
    windGustsKph: wind_gusts_10m,
    precipitationMm: precipitation,
    description: WEATHER_CODE_DESCRIPTIONS[weather_code] ?? "unknown conditions",
  };
}
