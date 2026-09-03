const scoreToGrade = (score) => {
  // turn a number of points into a letter grade
  if (score >= 100) return "S";
  const pointsOff = 99 - score;
  const letter = "ABCDE"[Math.floor(pointsOff / 15)];
  if (letter == undefined) return "F";
  const remainder = Math.floor(pointsOff % 15);
  const plusMinus = (
    remainder < 5 ? "+" :
    remainder >= 10 ? "-" :
    ""
  )
  return `${letter}${plusMinus}`
};

function sendMessage(message) {
  // communicate with the service worker
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (!response) reject(chrome.runtime.lastError);
      if (response.status != "ok") reject("request failed");
      resolve(response.response);
    })
  });
}

// the service worker performs these
const fetchSlopScanResult = (repoUrl) => sendMessage({ "type": "fetch", "repoUrl": repoUrl })
const performSlopScan = (repoUrl) => sendMessage({ "type": "scan", "repoUrl": repoUrl });
const getSlopScanPageURL = (repoUrl) => sendMessage({ "type": "getScanURL", "repoUrl": repoUrl });

// some code to help with their messy CSS/className things
function findElementWithClassStartingWith(prefix) {
  // returns both the element and the className
  const selector = `[class^=${prefix}],[class*=${prefix}]`;
  for (const element of document.querySelectorAll(selector)) {
    for (const className of element.classList) {
      if (className.startsWith(prefix)) return [element, className];
    }
  }
  return [undefined, undefined];
}

const findMangledClassName = (prefix) => findElementWithClassStartingWith(prefix)[1];
const findElement = (prefix) => findElementWithClassStartingWith(prefix)[0];

function createAiSection(repoUrl) {
  // build the AI usage section to insert in the sidebar
  const sectionClassName = findMangledClassName("SidebarSection-module__sidebarSection__");
  const headingClassName = findMangledClassName("SidebarSection-module__sectionHeading__");
  const headingClassName2 = findMangledClassName("prc-Heading-Heading-");
  const linkClassName = findMangledClassName("prc-Link-Link-");

  const aiSection = document.createElement("div");
  aiSection.classList.add(sectionClassName);
  const heading = document.createElement("h2");
  heading.setAttribute("data-variant", "small");
  heading.classList.add(headingClassName, headingClassName2);
  const headingSpan = document.createElement("span");  // why, GitHub?
  headingSpan.innerText = "AI usage";
  heading.appendChild(headingSpan);
  aiSection.appendChild(heading);

  aiSection.insertAdjacentHTML("beforeend", `
<div class="ai-usage">
  <div class="ai-usage__header">
    <div class="ai-usage__grade">
      -
    </div>
    <span class="ai-usage__label">
      Loading
    </span>
  </div>
  <span class="ai-usage__scan-info" style="display: none">
    <a target="_blank" class="ai-usage__last-scan" data-muted="true"></a>&nbsp;<button class="ai-usage__rescan-link">(rescan)</button>
  </span>
  <button class="btn btn-sm ai-usage__button" style="display: none">Scan</button>
</div>
`)
  aiSection.querySelectorAll("a").forEach(element => element.classList.add(linkClassName));
  getSlopScanPageURL(repoUrl).then(href => {
    aiSection.querySelector(".ai-usage__last-scan").setAttribute("href", href);
  })

  aiSection.querySelectorAll(".ai-usage__button, .ai-usage__rescan-link").forEach(button => {
    button.addEventListener("click", (event) => {
      event.target.setAttribute("disabled", "");
      trigger(true);
    })
  });

  const trigger = (rescan = false) => {
    (
      rescan
        ? performSlopScan(repoUrl)
        : fetchSlopScanResult(repoUrl)
    ).then((data) => {
      aiSection.querySelector(".ai-usage__button").style.display = data ? "none" : "";
      aiSection.querySelector(".ai-usage__scan-info").style.display = data ? "" : "none";

      if (data == null) {
        aiSection.querySelector(".ai-usage__label").innerText = "Not scanned";
        aiSection.querySelector(".ai-usage__grade").innerText = "?";
        return;
      }
      const score = data["score"]["value"];

      aiSection.querySelector(".ai-usage__label").innerText = (
        score >= 100 ? "None detected" :
        score >= 66 ? "Some detected" :
        "Significant usage detected"
      ) + (score < 100 ? ` (${score})` : "")
      aiSection.querySelector(".ai-usage__grade").innerText = scoreToGrade(score);

      const analyzedAt = new Date(data["record"]["analyzed_at"]);
      aiSection.querySelector(".ai-usage__last-scan").innerText = `Scanned on ${analyzedAt.toLocaleString(undefined, { dateStyle: "long" })}`;

      const toolsUsed = new Set(Object.values(data["record"]["evidence"]).flatMap(array => array).map(entry => entry["tool"]));
      toolsUsed.delete(null);  // remove nulls
      // this could be used later to show which AI tools were used
    })
    .catch((exception) => {
      alert("Something went wrong while fetching AI scan results.")
      console.error(exception);
    })
    .finally(() => {
      aiSection.querySelector(".ai-usage__button").removeAttribute("disabled");
      aiSection.querySelector(".ai-usage__rescan-link").removeAttribute("disabled");
    })
  };
  trigger();

  return aiSection;
}

window.addEventListener("DOMContentLoaded", () => {
  const [username, repoName] = document.location.pathname.split("/").slice(1, 3);
  const repoUrl = `https://github.com/${username}/${repoName}`;

  // make sure we are on the repo page
  if (!document.querySelector("#repository-container-header")) return;

  // we need this MutationObserver because this page gets client-side rendered.
  let aiSection;
  const observer = new MutationObserver(() => {
    if (aiSection && document.body.contains(aiSection)) return;
    const sidebar = findElement("CodeViewSidebar-module__borderGrid__");
    if (!sidebar) return;
    if (!aiSection) aiSection = createAiSection(repoUrl);
    // put the AI section right after the About section
    sidebar.children[0].insertAdjacentElement("afterend", aiSection);
  });
  observer.observe(document, { childList: true, subtree: true });
});

