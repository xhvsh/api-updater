const API_KEY = "api key here :3";

const RAW_URL = `https://gist.githubusercontent.com/xhvsh/ec578df51c8684fd9729ee86958c4dbc/raw/api.json`;
const API_URL = `https://api.github.com/gists/ec578df51c8684fd9729ee86958c4dbc`;

// html elements

const container = document.querySelector(".container");

const addBtn = document.querySelector("#addField");
const updateBtn = document.querySelector("#updateApi");
const cancelBtn = document.querySelector("#cancelChanges");

// helpers for json formating to avoid any inconsistency

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showNewlines(str) {
  return str.replace(/\n/g, "\\n");
}

function restoreNewlines(str) {
  return str.replace(/\\n/g, "\n");
}

// fetching and rendering on website

fetch(API_URL, {
  headers: {
    Authorization: `token ${API_KEY}`,
  },
})
  .then((res) => res.json())
  .then((gist) => {
    const rawUrl = gist.files["api.json"].raw_url; // this is basically getting latest raw_url dynamically from github api because it updates the link constantly
    return fetch(rawUrl);
  })
  .then((res) => res.json())
  .then((json) => renderData(json.data))
  .catch((err) => console.error("Fetch error:", err));

function renderData(dataArray) {
  container.innerHTML = "";
  dataArray.forEach((item) => createField(item.phrase, item.explanation));
}

// adding items to html (version 29810598 :sob:)

function createField(phrase = "", explanation = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "item";

  wrapper.innerHTML = `
    <label>Phrase</label>
    <input
      type="text"
      class="phrase-input"
      value="${escapeHtml(showNewlines(phrase))}"
    />

    <label>Explanation</label>
    <input
      type="text"
      class="explanation-input"
      value="${escapeHtml(showNewlines(explanation))}"
    />
  `;

  container.appendChild(wrapper);
}

// button handling, simple stuff... right?

addBtn.addEventListener("click", () => {
  createField();
});

cancelBtn.addEventListener("click", () => {
  location.reload();
});

updateBtn.addEventListener("click", () => {
  const items = document.querySelectorAll(".item");
  const rebuiltData = [];

  items.forEach((item) => {
    rebuiltData.push({
      phrase: restoreNewlines(item.querySelector(".phrase-input").value),
      explanation: restoreNewlines(item.querySelector(".explanation-input").value),
    });
  });

  updateGist({ data: rebuiltData });
});

// update the api

function updateGist(jsonData) {
  fetch(API_URL, {
    method: "PATCH",
    headers: {
      Authorization: `token ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: {
        ["api.json"]: {
          content: JSON.stringify(jsonData, null, 2),
        },
      },
    }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to update the api.");
      return res.json();
    })
    .then(() => {
      alert("Api updated successfully!");
      console.log("Api updated successfully.");
    })
    .catch((err) => {
      alert("Api update error, more info in console.");
      console.log("Api update error:", err);
    });
}
