import { useEffect, useState } from "react";
import { filesApi } from "@/api/files.api";

/** Downloads a protected file through Axios (bearer token) and exposes a revocable object URL. */
export function useFileObjectUrl(url: string | null | undefined) {
  const [state, setState] = useState<{ url: string; src: string | null; failed: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    filesApi
      .blob(url, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setState({ url, src: objectUrl, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ url, src: null, failed: true });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  const current = state && state.url === url ? state : null;
  return {
    src: current?.src ?? null,
    isLoading: Boolean(url) && !current,
    isError: current?.failed ?? false,
  };
}
