import { dashboardData } from "@/lib/dashboard/service";
import { privateError, privateJson } from "@/lib/private-api";
export async function GET(request: Request) {
  try {
    return privateJson(
      await dashboardData(
        Object.fromEntries(new URL(request.url).searchParams),
        request.headers,
      ),
    );
  } catch (error) {
    return privateError(error);
  }
}
