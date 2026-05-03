// Обновление старого дизайна для работы с новой структурой категорий

// 1. Обновляем загрузку категорий
function loadCategories() {
  const cats = db
    .prepare(
      `
    SELECT id, name, slug, description, parent_id, order_index,
           (SELECT COUNT(*) FROM products p WHERE p.category = c.name) as count
    FROM categories c 
    WHERE parent_id IS NULL
    ORDER BY order_index, name
  `
    )
    .all();
  state.categories = cats;
}

// 2. Обновляем renderCategory для работы с новыми категориями
function renderCategory(categorySlug, subCategorySlug = "") {
  const normalizedSlug = slugify(decodeURIComponent(String(categorySlug || "")));
  const category = state.categories.find((c) => slugify(c.name) === normalizedSlug);

  if (!category) {
    appEl.innerHTML = `<p>Категория не найдена</p>`;
    return;
  }

  // Получаем товары для категории
  const inCategory = state.products.filter((p) => p.category === category.name);
  const subCategories = uniqueSorted(inCategory.map((p) => p.group_name));
  const normalizedSubSlug = slugify(decodeURIComponent(String(subCategorySlug || "")));
  const selectedSub = normalizedSubSlug ? subCategories.find((name) => slugify(name) === normalizedSubSlug) || "" : "";

  const facetBase = inCategory.filter((p) => !selectedSub || p.group_name === selectedSub);
  const facetBrands = facetCounts(facetBase, (p) => p.brand || "Без бренда");
  const facetTypes = facetCounts(facetBase, getProductType);
  const minFacetPrice = facetBase.length ? Math.floor(Math.min(...facetBase.map((p) => Number(p.price || 0)))) : 0;
  const maxFacetPrice = facetBase.length ? Math.ceil(Math.max(...facetBase.map((p) => Number(p.price || 0)))) : 0;

  const selectedBrandSet = new Set(state.filters.brands);
  const minSelected = state.filters.minPrice !== "" ? Number(state.filters.minPrice) : null;
  const maxSelected = state.filters.maxPrice !== "" ? Number(state.filters.maxPrice) : null;

  const items = state.products.filter((p) => {
    const byCategory = p.category === category.name;
    const bySub = !selectedSub || p.group_name === selectedSub;
    const byBrand = selectedBrandSet.size === 0 || selectedBrandSet.has(p.brand || "Без бренда");
    const byMinPrice = minSelected === null || Number(p.price || 0) >= minSelected;
    const byMaxPrice = maxSelected === null || Number(p.price || 0) <= maxSelected;
    return byCategory && bySub && byBrand && byMinPrice && byMaxPrice;
  });

  appEl.innerHTML = `
    ${pageTitle(category.name)}
    ${
      subCategories.length > 0
        ? `
      <section class="subcategory-chips">
        <a class="subcategory-chip ${selectedSub === "" ? "is-active" : ""}" href="#/catalog/${slugify(category.name)}">Все</a>
        ${subCategories
          .map(
            (sub) => `
            <a class="subcategory-chip ${selectedSub === sub ? "is-active" : ""}" href="#/catalog/${slugify(category.name)}/${slugify(sub)}">${sub}</a>
          `
          )
          .join("")}
      </section>
    `
        : ""
    }
    ${
      facetBrands.length > 0 || facetTypes.length > 0
        ? `
      <section class="filters">
        <h4>Фильтры</h4>

        <fieldset class="filter-group">
          <legend>Бренд</legend>
          <div class="filter-scroll">
            ${facetBrands
              .map((brandItem) => {
                const brand = brandItem.value;
                const checked = selectedBrandSet.has(brand) ? "checked" : "";
                return `
                  <label class="check-field">
                    <input class="check-input" type="checkbox" value="${brand}" data-filter-brand ${checked} />
                    ${brand} (${brandItem.count})
                  </label>
                `;
              })
              .join("")}
          </div>
        </fieldset>

        ${
          facetTypes.length > 1
            ? `
          <fieldset class="filter-group">
            <legend>Тип</legend>
            <div class="filter-scroll">
              ${facetTypes
                .map((typeItem) => {
                  const type = typeItem.value;
                  const checked = state.filters.types.includes(type) ? "checked" : "";
                  return `
                    <label class="check-field">
                      <input class="check-input" type="checkbox" value="${type}" data-filter-type ${checked} />
                      ${type} (${typeItem.count})
                    </label>
                  `;
                })
                .join("")}
            </div>
          </fieldset>
        `
            : ""
        }

        <fieldset class="filter-group">
          <legend>Цена, руб.</legend>
          <div class="price-row">
            <input class="input" id="minPriceFilter" type="number" min="${minFacetPrice}" placeholder="от ${minFacetPrice}" value="${state.filters.minPrice}" />
            <input class="input" id="maxPriceFilter" type="number" min="${minFacetPrice}" placeholder="до ${maxFacetPrice}" value="${state.filters.maxPrice}" />
          </div>
        </fieldset>
      </section>
    `
        : ""
    }
    ${
      items.length > 0
        ? `
      <div class="grid-layout">
        <section class="product-grid">
          ${items
            .map(
              (p) => `
              <a class="product-card" href="#/product/${p.id}">
                ${p.is_extra ? '<div class="extra-badge" title="Лишний товар">⚠</div>' : ''}
                <button class="fav-card-btn ${isFavorite(p.id) ? "is-active" : ""}" type="button" data-fav-toggle="${p.id}" aria-label="Избранное">${
                  isFavorite(p.id) ? "♥" : "♡"
                }</button>
                ${imageTag(p.image, p.name)}
                <h3>${p.name}</h3>
                <div class="price">${formatPrice(p.price)} / шт</div>
              </a>
            `
            )
            .join("")}
        </section>
        <aside class="filters">
        <h4>Фильтры</h4>

        <fieldset class="filter-group">
          <legend>Бренд</legend>
          <div class="filter-scroll">
            ${facetBrands
              .map((brandItem) => {
                const brand = brandItem.value;
                const checked = selectedBrandSet.has(brand) ? "checked" : "";
                return `
                  <label class="check-field">
                    <input class="check-input" type="checkbox" value="${brand}" data-filter-brand ${checked} />
                    ${brand} (${brandItem.count})
                  </label>
                `;
              })
              .join("")}
          </div>
        </fieldset>

        <fieldset class="filter-group">
          <legend>Цена, руб.</legend>
          <div class="price-row">
            <input class="input" id="minPriceFilter" type="number" min="${minFacetPrice}" placeholder="от ${minFacetPrice}" value="${state.filters.minPrice}" />
            <input class="input" id="maxPriceFilter" type="number" min="${minFacetPrice}" placeholder="до ${maxFacetPrice}" value="${state.filters.maxPrice}" />
          </div>
        </fieldset>
      </aside>
      </div>
    `
        : `<p class="note">По заданным параметрам товары не найдены. Попробуйте изменить фильтры.</p>`
    }
  `;

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavorite(id);
      btn.classList.toggle("is-active", isFavorite(id));
      btn.textContent = isFavorite(id) ? "♥" : "♡";
    });
  });

  // Обработчики фильтров
  appEl.querySelectorAll("[data-filter-brand]").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        state.filters.brands.push(cb.value);
      } else {
        state.filters.brands = state.filters.brands.filter((b) => b !== cb.value);
      }
      renderCategory(categorySlug, subCategorySlug);
    });
  });

  appEl.querySelectorAll("[data-filter-type]").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        state.filters.types.push(cb.value);
      } else {
        state.filters.types = state.filters.types.filter((t) => t !== cb.value);
      }
      renderCategory(categorySlug, subCategorySlug);
    });
  });

  const minPriceEl = document.getElementById("minPriceFilter");
  const maxPriceEl = document.getElementById("maxPriceFilter");
  if (minPriceEl && maxPriceEl) {
    const priceHandler = () => {
      state.filters.minPrice = minPriceEl.value;
      state.filters.maxPrice = maxPriceEl.value;
      renderCategory(categorySlug, subCategorySlug);
    };
    minPriceEl.addEventListener("input", priceHandler);
    maxPriceEl.addEventListener("input", priceHandler);
  }
}

// 3. Обновляем главную страницу для показа новых категорий
function renderCatalogPage() {
  const visible = state.categories.filter((c) => c.count > 0);
  appEl.innerHTML = `
    ${pageTitle("Каталог")}
    <section class="category-grid">
      ${visible
        .map(
          (c) => `
            <a class="category-card" href="#/catalog/${slugify(c.name)}">
              ${imageTag(c.image, c.name)}
              <h3>${c.name}</h3>
              <div class="category-count">${c.count} товаров</div>
            </a>
          `
        )
        .join("")}
    </section>
    ${visible.length === 0 ? `<p class="note">Категории не найдены. Очистите поиск.</p>` : ""}
  `;

  appEl.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.favToggle;
      toggleFavorite(id);
      btn.classList.toggle("is-active", isFavorite(id));
      btn.textContent = isFavorite(id) ? "♥" : "♡";
    });
  });
  bindSearch();
}

console.log("✅ Старый дизайн обновлен для работы с новой структурой категорий");
