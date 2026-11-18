/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const generateRoutineButton =
  document.getElementById("generateRoutine");

const workerUrl =
  "https://loreal-chat-bot.micah-a-wheeler.workers.dev/";

/* This array keeps the system prompt and the whole conversation */
let messages = [];

/* Keep track of selected products and save them in browser storage */
let selectedProducts = [];

// Restore saved selections, or start empty if the saved data is invalid
try {
  selectedProducts = JSON.parse(
    localStorage.getItem("selectedProducts") || "[]"
  );
} catch (error) {
  selectedProducts = [];
}
let allProducts = [];

/* Update page direction when the document language changes */
function updatePageDirection() {
  const language = document.documentElement.lang.toLowerCase();
  const rtlLanguages = [
    "ar",
    "he",
    "fa",
    "ur",
    "ps",
    "sd",
    "yi",
    "ku",
  ];
  const isRightToLeft = rtlLanguages.some(
    (code) => language === code || language.startsWith(`${code}-`)
  );

  document.documentElement.dir = isRightToLeft ? "rtl" : "ltr";
}

updatePageDirection();

// Watch for changes made in browser developer tools or accessibility tools
const languageObserver = new MutationObserver(updatePageDirection);
languageObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"],
});

/* Save selected products so they remain after a refresh */
function saveSelectedProducts() {
  localStorage.setItem("selectedProducts", JSON.stringify(selectedProducts));
}

/* Show a message in the chat window */
function addChatMessage(role, text) {
  const messageElement = document.createElement("div");
  messageElement.className =
    role === "user" ? "chat-message user-message" : "chat-message ai-message";
  messageElement.textContent = text;
  messageElement.dir = "auto";
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Send the conversation to the Cloudflare Worker */
async function sendToWorker(conversation = messages) {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: conversation }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "Unable to get an AI response.");
  }

  const choice = data.choices[0];

  return {
    content: choice.message.content,
    finishReason: choice.finish_reason,
  };
}

/* Ask for another response if the worker limit cuts off the answer */
async function getCompleteReply() {
  let conversation = [...messages];
  let fullReply = "";

  // Continue up to three more times if an answer is marked as truncated
  for (let part = 0; part < 4; part++) {
    const reply = await sendToWorker(conversation);
    fullReply += reply.content;

    if (reply.finishReason !== "length") {
      break;
    }

    conversation.push(
      { role: "assistant", content: reply.content },
      {
        role: "user",
        content: "Please continue the previous answer exactly where it stopped.",
      }
    );
  }

  return fullReply;
}

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Search or select a category to view products
  </div>
`;

updateSelectedProducts();

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML =
      '<div class="placeholder-message">No products match your search</div>';
    return;
  }

  productsContainer.innerHTML = products
    .map(
      (product) => `
  <div class="product-card ${
      selectedProducts.some((selected) => selected.id === product.id)
        ? "selected"
        : ""
    }" data-product-id="${product.id}" tabindex="0">
      <img src="${product.image}" alt="${product.name}">
    <div class="product-info" dir="auto">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
      <div class="product-description">
        ${product.description}
      </div>
    </div>
  `
    )
    .join("");
}

/* Show selected products and add a button that removes each one */
function updateSelectedProducts() {
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML =
      '<p class="selected-placeholder">No products selected yet</p>';
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-product">
        <span>${product.brand} - ${product.name}</span>
        <button type="button" class="remove-product" data-product-id="${product.id}">
          &times;
        </button>
      </div>
    `
    )
    .join("");
}

/* Toggle a product when its card is clicked */
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");

  if (card) {
    const productId = Number(card.dataset.productId);
    const isSelected = selectedProducts.some(
      (product) => product.id === productId
    );

    if (isSelected) {
      selectedProducts = selectedProducts.filter(
        (product) => product.id !== productId
      );
    } else {
      // Find the full product data so it can be used by the routine builder
      const productToAdd = allProducts.find(
        (product) => product.id === productId
      );

      if (productToAdd) {
        selectedProducts.push(productToAdd);
      }
    }

    card.classList.toggle("selected");
    saveSelectedProducts();
    updateSelectedProducts();
  }
});

/* Deselect a product using the remove button */
selectedProductsList.addEventListener("click", (e) => {
  if (e.target.classList.contains("remove-product")) {
    const productId = Number(e.target.dataset.productId);

    selectedProducts = selectedProducts.filter(
      (product) => product.id !== productId
    );

    const card = document.querySelector(
      `.product-card[data-product-id="${productId}"]`
    );

    if (card) {
      card.classList.remove("selected");
    }

    saveSelectedProducts();
    updateSelectedProducts();
  }
});

/* Filter products using the selected category and search text */
async function filterProducts() {
  const products = allProducts.length > 0 ? allProducts : await loadProducts();
  const selectedCategory = categoryFilter.value;
  const searchText = productSearch.value.trim().toLowerCase();

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategory === "" ||
      selectedCategory === "all" ||
      product.category === selectedCategory;
    const searchableText =
      `${product.name} ${product.brand} ${product.description}`.toLowerCase();
    const matchesSearch =
      searchText === "" || searchableText.includes(searchText);

    return matchesCategory && matchesSearch;
  });

  displayProducts(filteredProducts);
}

/* Update results as the category or search text changes */
categoryFilter.addEventListener("change", filterProducts);
productSearch.addEventListener("input", filterProducts);

/* Generate a morning routine using the selected products */
generateRoutineButton.addEventListener("click", async () => {
  if (selectedProducts.length === 0) {
    chatWindow.innerHTML = "<p>Please select at least one product first.</p>";
    return;
  }

  const productDetails = selectedProducts
    .map(
      (product) =>
        `${product.brand} - ${product.name}: ${product.description}`
    )
    .join("\n");

  messages = [
    {
      role: "system",
      content:
        "You are a helpful L'Oreal beauty and skincare advisor. Only discuss L'Oreal products, beauty routines, skincare, haircare, makeup, fragrance, and responsible use of the selected products. Create safe, practical routines and explain them in a beginner-friendly way. Do not invent product features or claim that products treat medical conditions. If a user asks about an unrelated topic, politely explain that you can only help with beauty and L'Oreal product questions, then offer a relevant beauty suggestion.",
    },
    {
      role: "user",
      content: `Create a morning routine using only these selected products:\n${productDetails}`,
    },
  ];

  chatWindow.innerHTML = "<p>Creating your morning routine...</p>";

  try {
    const reply = await getCompleteReply();
    messages.push({ role: "assistant", content: reply });
    chatWindow.innerHTML = "";
    addChatMessage("assistant", reply);
  } catch (error) {
    chatWindow.innerHTML = `<p>${error.message}</p>`;
  }
});

/* Send follow-up questions while keeping the conversation history */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userInput = document.getElementById("userInput");
  const question = userInput.value.trim();

  if (question === "") {
    return;
  }

  if (messages.length === 0) {
    chatWindow.innerHTML =
      "<p>Generate a routine before asking follow-up questions.</p>";
    return;
  }

  messages.push({ role: "user", content: question });
  addChatMessage("user", question);
  userInput.value = "";

  try {
    const reply = await getCompleteReply();
    messages.push({ role: "assistant", content: reply });
    addChatMessage("assistant", reply);
  } catch (error) {
    addChatMessage("assistant", error.message);
  }
});