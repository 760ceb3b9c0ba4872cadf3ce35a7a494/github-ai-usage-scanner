const SLOPSCAN_HOST = "https://slopscan.ava.pet";
const getSlopScanPageUrl = repoUrl => `${SLOPSCAN_HOST}/repo/${encodeURIComponent(repoUrl)}`;

async function fetchSlopScanResult(repoUrl) {
  const result = await fetch(getSlopScanPageUrl(repoUrl), {
    headers: {
      "Accept": "application/json"
    }
  });
  if (result.status == 404) return null;
  if (!result.ok) throw new Error("request error");
  const data = await result.json();
  return data;
}

async function performSlopScan(repoUrl) {
  const result = await fetch(`${SLOPSCAN_HOST}/scan`, {
    method: "POST",
    body: new URLSearchParams({
      "url": repoUrl
    }),
    headers: {
      "Accept": "application/json"
    }
  });
  if (result.status == 404) return null;
  if (!result.ok) throw new Error("request error");
  const data = await result.json();
  return data;
}

const callbacks = {
  "fetch": ({ repoUrl }) => fetchSlopScanResult(repoUrl),
  "scan": ({ repoUrl }) => performSlopScan(repoUrl),
  "getScanURL": ({ repoUrl }) => getSlopScanPageUrl(repoUrl),
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (sender.id != chrome.runtime.id) return;
  (async () => {
    const callbackFunction = callbacks[request.type];
    return await callbackFunction(request);
  })()
    .then(response => sendResponse({ "status": "ok", "response": response }))
    .catch(() => sendResponse({ "status": "error" }));
  return true;
})
