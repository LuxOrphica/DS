class AdminApp {
  constructor() {
    this.currentPage = 'products';
    this.currentFilters = {};
    this.selectedProducts = new Set();
    this.currentProduct = null;
    this.currentVariants = [];
    this.currentMedia = [];
    this.currentDocuments = [];
    this.currentContentTabs = [];
    this.selectedContentTabId = null;
    this.ordersFilters = {};
    this.currentOrder = null;
    this.loadedProducts = [];
    this.filteredRowsCount = 0;
    this.tableSort = { key: 'updatedAt', dir: 'desc' };
    this.headerFilter = { open: false, key: '', tempValue: '', anchor: null };
    this.availableFilters = { brands: [], categories: [], groups: [] };
    this.categoryGroupsIndex = new Map();
    this.catalogTaxonomy = {
      brands: [],
      functionalCategories: [],
      brandCategories: []
    };
    this.functionalCategoryCounts = new Map();
    this.attributeDefinitions = [];
    this.categoryAttributeTemplates = [];
    this.columnFilters = {
      brand: '',
      category: '',
      status: '',
      docs: '',
      priceMin: '',
      priceMax: ''
    };
    this.pagination = {
      offset: 0,
      limit: 50,
      total: 0,
      hasMore: false
    };
    this.summaryProducts = null;
    this.categoriesViewMode = 'brand';
    this.categoriesDictionaryTab = 'functional';
    this.adminToken = '';
    this.isAuthenticated = false;
    this.isAppBootstrapped = false;
    this.brandCategoryFallbackCache = new Map();
    this.functionalTreeExpanded = new Set();
    this.functionalTreeSeeded = false;
    this.brandTreeExpanded = new Set();

    this.init();
  }

  getFunctionalCategoryOrder() {
    return [
      'Управление и автоматизация',
      'Аудио и мультимедиа',
      'Освещение',
      'Безопасность и доступ',
      'Климат',
      'Энергия и учет',
      'Монтаж и расходники',
      'Комплекты'
    ];
  }

  getFunctionalSubcategoryOrderMap() {
    return {
      'Управление и автоматизация': [
        'Минисерверы и расширения',
        'Контроллеры',
        'Реле и диммеры',
        'Шторы',
        'Датчики',
        'HMI',
        'Аксессуары',
        'Комплектующие',
        'Управление',
        'Софт и сервисы',
        'Прочее'
      ],
      'Аудио и мультимедиа': [
        'Multiroom',
        'Аудио',
        'Акустика',
        'Прочее'
      ],
      'Освещение': [
        'Светильники',
        'Реле и диммеры',
        'Выключатели и панели',
        'Датчики',
        'LED-ленты',
        'Контроллеры освещения',
        'Аксессуары',
        'Прочее'
      ],
      'Безопасность и доступ': [
        'Датчики',
        'Контроль доступа',
        'Кнопки и брелоки',
        'Сирены и тревожные устройства',
        'Аксессуары',
        'Прочее'
      ],
      'Климат': [
        'Датчики климата',
        'Управление кондиционерами',
        'Термостаты',
        'Приводы и клапаны',
        'Контроллеры климата',
        'Аксессуары',
        'Прочее'
      ],
      'Энергия и учет': [
        'Электросчетчики',
        'Прочее'
      ],
      'Монтаж и расходники': [
        'Кабели и переходники',
        'Крепеж',
        'Монтажные элементы',
        'Аксессуары',
        'Прочее'
      ],
      'Комплекты': [
        'Готовые комплекты',
        'Наборы для освещения',
        'Наборы управления',
        'Наборы датчиков',
        'Прочее'
      ]
    };
  }

  init() {
    this.updateAdminTokenUi();
    this.setupLoginGate();
    this.setupEventListeners();
    this.setupNavigation();
    this.bootstrapAdminSession();
  }

  setupEventListeners() {
    const createProductBtn = document.getElementById('createProductBtn');
    if (createProductBtn) createProductBtn.addEventListener('click', () => this.createProduct());
    const createBrandBtn = document.getElementById('createBrandBtn');
    if (createBrandBtn) createBrandBtn.addEventListener('click', () => this.createBrand());
    const createFunctionalCategoryBtn = document.getElementById('createFunctionalCategoryBtn');
    if (createFunctionalCategoryBtn) createFunctionalCategoryBtn.addEventListener('click', () => this.createFunctionalCategory());
    const createBrandCategoryBtn = document.getElementById('createBrandCategoryBtn');
    if (createBrandCategoryBtn) createBrandCategoryBtn.addEventListener('click', () => this.createBrandCategory());
    const createCategoryAttributeTemplateBtn = document.getElementById('createCategoryAttributeTemplateBtn');
    if (createCategoryAttributeTemplateBtn) createCategoryAttributeTemplateBtn.addEventListener('click', () => this.createCategoryAttributeTemplate());
    const importProductsBtn = document.getElementById('importProductsBtn');
    if (importProductsBtn) importProductsBtn.addEventListener('click', () => this.importProducts());
    const exportProductsBtn = document.getElementById('exportProductsBtn');
    if (exportProductsBtn) exportProductsBtn.addEventListener('click', () => this.exportProducts());
    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', () => this.logoutAdmin());
    const backToProductsBtn = document.getElementById('backToProductsBtn');
    if (backToProductsBtn) backToProductsBtn.addEventListener('click', () => this.backToProducts());
    const resetProductsFiltersBtn = document.getElementById('resetProductsFiltersBtn');
    if (resetProductsFiltersBtn) resetProductsFiltersBtn.addEventListener('click', () => this.resetFilters());
    const previewProductBtn = document.getElementById('previewProductBtn');
    if (previewProductBtn) previewProductBtn.addEventListener('click', () => this.previewProduct());
    const saveProductBtn = document.getElementById('saveProductBtn');
    if (saveProductBtn) saveProductBtn.addEventListener('click', () => this.saveProduct());
    const openProductPhotosTabBtn = document.getElementById('openProductPhotosTabBtn');
    if (openProductPhotosTabBtn) openProductPhotosTabBtn.addEventListener('click', () => this.switchEditorTab('photos'));
    const addVariantRowBtn = document.getElementById('addVariantRowBtn');
    if (addVariantRowBtn) addVariantRowBtn.addEventListener('click', () => this.addVariantRow());
    const addContentTabBtn = document.getElementById('addContentTabBtn');
    if (addContentTabBtn) addContentTabBtn.addEventListener('click', () => this.addContentTab());
    const addContentBlockBtn = document.getElementById('addContentBlockBtn');
    if (addContentBlockBtn) addContentBlockBtn.addEventListener('click', () => this.addContentBlock());
    const saveContentTabBtn = document.getElementById('saveContentTabBtn');
    if (saveContentTabBtn) saveContentTabBtn.addEventListener('click', () => this.saveContentTab());
    const deleteContentTabBtn = document.getElementById('deleteContentTabBtn');
    if (deleteContentTabBtn) deleteContentTabBtn.addEventListener('click', () => this.deleteContentTab());
    const refreshAttributeEditorBtn = document.getElementById('refreshAttributeEditorBtn');
    if (refreshAttributeEditorBtn) refreshAttributeEditorBtn.addEventListener('click', () => this.refreshAttributeEditor());
    const syncAttributesFromRawBtn = document.getElementById('syncAttributesFromRawBtn');
    if (syncAttributesFromRawBtn) syncAttributesFromRawBtn.addEventListener('click', () => this.syncAttributesFromRaw());
    const addDocumentRowBtn = document.getElementById('addDocumentRowBtn');
    if (addDocumentRowBtn) addDocumentRowBtn.addEventListener('click', () => this.addDocumentRow());
    const saveDocumentsBtn = document.getElementById('saveDocumentsBtn');
    if (saveDocumentsBtn) saveDocumentsBtn.addEventListener('click', () => this.saveDocuments());
    const applyBulkActionBtn = document.getElementById('applyBulkActionBtn');
    if (applyBulkActionBtn) applyBulkActionBtn.addEventListener('click', () => this.applyBulkAction());
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');
    if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', () => this.clearSelection());
    const resetOrdersFiltersBtn = document.getElementById('resetOrdersFiltersBtn');
    if (resetOrdersFiltersBtn) resetOrdersFiltersBtn.addEventListener('click', () => this.resetOrdersFilters());
    const saveOrderModalBtn = document.getElementById('saveOrderModalBtn');
    if (saveOrderModalBtn) saveOrderModalBtn.addEventListener('click', () => this.saveOrderModal());
    const selectAll = document.getElementById('selectAll');
    if (selectAll) selectAll.addEventListener('change', () => this.toggleSelectAll());

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener(
        'input',
        this.debounce(() => {
          this.applyFilters();
        }, 300)
      );
    }

    [
      'categoryFilter',
      'brandCategoryFilter',
      'groupFilter',
      'variantConflictFilter'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this.applyFilters());
    });

    const brandFilter = document.getElementById('brandFilter');
    if (brandFilter) {
      brandFilter.addEventListener('change', async () => {
        await this.syncBrandCategoryFilterOptions();
        this.applyFilters();
      });
    }

    document.querySelectorAll('[data-taxonomy-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = String(btn.dataset.taxonomyTab || '').trim();
        this.setCategoriesDictionaryTab(tab);
      });
    });

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.closeModal(String(btn.dataset.closeModal || ''));
      });
    });

    document.querySelectorAll('[data-product-editor-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = String(btn.dataset.productEditorAction || '').trim();
        if (action === 'duplicate') this.duplicateProduct();
        if (action === 'archive') this.archiveProduct();
        if (action === 'delete') this.deleteProduct();
      });
    });

    const categoriesDictionarySearch = document.getElementById('categoriesDictionarySearch');
    if (categoriesDictionarySearch) {
      categoriesDictionarySearch.addEventListener('input', () => this.applyCategoriesDictionarySearch());
    }

    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', () => {
        this.syncGroupFilterOptions();
        this.syncCategoryTreeFilterValue();
      });
    }

    const categoryTreeFilter = document.getElementById('categoryTreeFilter');
    if (categoryTreeFilter) {
      categoryTreeFilter.addEventListener('change', () => {
        this.applyCategoryTreeFilter();
        this.applyFilters();
      });
    }

    const perPage = document.querySelector('.select-per-page');
    if (perPage) {
      perPage.addEventListener('change', (e) => {
        this.pagination.limit = parseInt(e.target.value, 10);
        this.pagination.offset = 0;
        this.loadProducts();
      });
    }

    document.querySelectorAll('.editor-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => this.switchEditorTab(e.target.dataset.tab));
    });

    const productStatus = document.getElementById('productStatus');
    if (productStatus) {
      productStatus.addEventListener('change', () => {
        this.refreshQualityIndicator();
        this.renderProductOverview();
      });
    }
    [
      'productName',
      'productArticle',
      'productBrand',
      'productCategory',
      'productFunctionalCategories',
      'productPrice',
      'productDescription',
      'productSlug',
      'productMetaTitle',
      'productMetaDescription'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(eventName, () => {
        this.renderProductOverview();
        this.updateSeoPreview();
      });
    });
    const productBrand = document.getElementById('productBrand');
    if (productBrand) {
      productBrand.addEventListener('change', () => this.syncProductBrandCategoryOptions());
    }
    const productCategory = document.getElementById('productCategory');
    if (productCategory) {
      productCategory.addEventListener('change', () => {
        this.syncProductFunctionalSubcategories();
        this.renderProductAttributeEditor();
      });
    }
    const productFunctionalCategories = document.getElementById('productFunctionalCategories');
    if (productFunctionalCategories) {
      productFunctionalCategories.addEventListener('change', () => this.renderProductAttributeEditor());
    }
    const productAttributesJson = document.getElementById('productAttributesJson');
    if (productAttributesJson) {
      productAttributesJson.addEventListener('change', () => this.renderProductAttributeEditor());
    }

    document.querySelectorAll('.products-table th.sortable').forEach((th) => {
      th.addEventListener('click', (e) => {
        if (e.target.closest('.head-filter-btn') || e.target.closest('.head-filter-badge')) return;
        this.setTableSort(th.dataset.sortKey || '');
      });
    });

    document.querySelectorAll('.head-filter-btn[data-filter-key]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const key = String(btn.dataset.filterKey || '').trim();
        if (!key) return;
        this.openHeaderFilter(key, e);
      });
    });

    document.addEventListener('click', (e) => {
      const popover = document.getElementById('tableHeaderFilterPopover');
      if (!popover || popover.classList.contains('hidden')) return;
      if (popover.contains(e.target)) return;
      if (e.target.closest('.head-filter-btn')) return;
      this.closeHeaderFilter();
    });

    const productsTableBody = document.getElementById('productsTableBody');
    if (productsTableBody && !productsTableBody.dataset.actionsBound) {
      productsTableBody.dataset.actionsBound = '1';
      productsTableBody.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-product-action]');
        if (!btn) return;
        const action = String(btn.dataset.productAction || '').trim();
        const productId = String(btn.dataset.id || '').trim();
        if (!productId) return;
        if (action === 'photos') {
          this.openProductPhotos(productId);
          return;
        }
        if (action === 'edit') {
          this.editProduct(productId);
          return;
        }
        if (action === 'view') {
          window.open(`/#/product/${productId}`, '_blank');
          return;
        }
        if (action === 'toggle-visibility') {
          const productName = String(btn.dataset.name || '').trim();
          const currentStatus = String(btn.dataset.status || '').trim();
          this.toggleProductVisibility(productId, currentStatus, productName);
          return;
        }
        if (action === 'delete') {
          const productName = String(btn.dataset.name || '').trim();
          this.deleteProductById(productId, productName);
        }
      });
      productsTableBody.addEventListener('change', (event) => {
        const checkbox = event.target.closest('.product-checkbox[data-id]');
        if (!checkbox) return;
        this.toggleProductSelection(String(checkbox.dataset.id || ''));
      });
    }

    const ordersTableBody = document.getElementById('ordersTableBody');
    if (ordersTableBody && !ordersTableBody.dataset.actionsBound) {
      ordersTableBody.dataset.actionsBound = '1';
      ordersTableBody.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-order-action]');
        if (!btn) return;
        const action = String(btn.dataset.orderAction || '').trim();
        const orderId = String(btn.dataset.id || '').trim();
        if (action === 'details' && orderId) this.viewOrderDetails(orderId);
      });
    }

    const categoryAttributeTemplatesBody = document.getElementById('categoryAttributeTemplatesBody');
    if (categoryAttributeTemplatesBody && !categoryAttributeTemplatesBody.dataset.actionsBound) {
      categoryAttributeTemplatesBody.dataset.actionsBound = '1';
      categoryAttributeTemplatesBody.addEventListener('change', (event) => {
        const input = event.target.closest('input[data-template-action="toggle-required"][data-id]');
        if (!input) return;
        this.toggleTemplateRequired(Number(input.dataset.id), Boolean(input.checked));
      });
      categoryAttributeTemplatesBody.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-template-action="delete"][data-id]');
        if (!btn) return;
        this.deleteCategoryAttributeTemplate(Number(btn.dataset.id));
      });
    }

    const variantsTableBody = document.getElementById('variantsTableBody');
    if (variantsTableBody && !variantsTableBody.dataset.actionsBound) {
      variantsTableBody.dataset.actionsBound = '1';
      variantsTableBody.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-variant-action][data-index]');
        if (!btn) return;
        const index = Number(btn.dataset.index);
        if (btn.dataset.variantAction === 'save') this.saveVariantRow(index);
        if (btn.dataset.variantAction === 'delete') this.deleteVariantRow(index);
      });
    }

    const mediaTableBody = document.getElementById('mediaTableBody');
    if (mediaTableBody && !mediaTableBody.dataset.actionsBound) {
      mediaTableBody.dataset.actionsBound = '1';
      mediaTableBody.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-media-action="delete"][data-index]');
        if (!btn) return;
        this.deleteMediaRow(Number(btn.dataset.index));
      });
    }

    const documentsTableBody = document.getElementById('documentsTableBody');
    if (documentsTableBody && !documentsTableBody.dataset.actionsBound) {
      documentsTableBody.dataset.actionsBound = '1';
      documentsTableBody.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-document-action="delete"][data-index]');
        if (!btn) return;
        this.deleteDocumentRow(Number(btn.dataset.index));
      });
    }

    const orderModalBody = document.getElementById('orderModalBody');
    if (orderModalBody && !orderModalBody.dataset.actionsBound) {
      orderModalBody.dataset.actionsBound = '1';
      orderModalBody.addEventListener('click', (event) => {
        const addBtn = event.target.closest('button[data-order-doc-action="add"]');
        if (addBtn) {
          this.addOrderModalDocumentRow();
          return;
        }
        const removeBtn = event.target.closest('button[data-order-doc-action="remove"][data-index]');
        if (removeBtn) this.removeOrderModalDocumentRow(Number(removeBtn.dataset.index));
      });
    }

    const contentTabsList = document.getElementById('contentTabsList');
    if (contentTabsList && !contentTabsList.dataset.actionsBound) {
      contentTabsList.dataset.actionsBound = '1';
      contentTabsList.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-content-tab-id]');
        if (!btn) return;
        this.selectContentTab(Number(btn.dataset.contentTabId));
      });
    }

    const contentBlocksList = document.getElementById('contentBlocksList');
    if (contentBlocksList && !contentBlocksList.dataset.actionsBound) {
      contentBlocksList.dataset.actionsBound = '1';
      contentBlocksList.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-content-action]');
        if (!btn) return;
        const action = String(btn.dataset.contentAction || '').trim();
        if (action === 'remove-block') this.removeContentBlock(Number(btn.dataset.blockIndex));
        if (action === 'add-table-row') this.addTableRowToBlock(Number(btn.dataset.blockIndex));
        if (action === 'remove-table-row') this.removeTableRowFromBlock(Number(btn.dataset.blockIndex), Number(btn.dataset.rowIndex));
        if (action === 'remove-table-row-node') this.removeTableRowNode(btn);
      });
    }

    const pagination = document.getElementById('pagination');
    if (pagination && !pagination.dataset.actionsBound) {
      pagination.dataset.actionsBound = '1';
      pagination.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;
        this.goToPage(Number(btn.dataset.page));
      });
    }

    // Product editor actions dropdown (button "...")
    document.querySelectorAll('.dropdown > .btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const dropdown = btn.closest('.dropdown');
        const menu = dropdown?.querySelector('.dropdown-menu');
        if (!menu) return;
        const willOpen = !menu.classList.contains('show');
        document.querySelectorAll('.dropdown-menu.show').forEach((m) => m.classList.remove('show'));
        if (willOpen) menu.classList.add('show');
      });
    });
    document.addEventListener('click', () => {
      document.querySelectorAll('.dropdown-menu.show').forEach((m) => m.classList.remove('show'));
    });
    document.querySelectorAll('.dropdown-menu button, .dropdown-menu a').forEach((item) => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu.show').forEach((m) => m.classList.remove('show'));
      });
    });

    const applyOrdersDebounced = this.debounce(() => this.applyOrdersFilters(), 250);
    const ordersSearchInput = document.getElementById('ordersSearchInput');
    if (ordersSearchInput) {
      ordersSearchInput.addEventListener('input', applyOrdersDebounced);
    }
    const ordersManagerInput = document.getElementById('ordersManagerFilter');
    if (ordersManagerInput) {
      ordersManagerInput.addEventListener('input', applyOrdersDebounced);
    }
    [
      'ordersStatusFilter',
      'ordersPaymentFilter',
      'ordersPaymentStatusFilter',
      'ordersDeliveryFilter',
      'ordersManagerFilter',
      'ordersDateFrom',
      'ordersDateTo'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', applyOrdersDebounced);
    });
  

    this.bindTaxonomyActions();
  }
  bindTaxonomyActions() {
    const ids = ['brandsTreeBody', 'functionalTreeBody', 'brandTreeBody'];
    ids.forEach((id) => {
      const root = document.getElementById(id);
      if (!root || root.dataset.taxonomyActionsBound === '1') return;
      root.dataset.taxonomyActionsBound = '1';
      root.addEventListener('click', (event) => {
        const toggleBtn = event.target.closest('button[data-tree-toggle-id]');
        if (toggleBtn) {
          const toggleId = Number(toggleBtn.dataset.treeToggleId || 0);
          if (!toggleId) return;
          if (this.functionalTreeExpanded.has(toggleId)) this.functionalTreeExpanded.delete(toggleId);
          else this.functionalTreeExpanded.add(toggleId);
          this.renderTaxonomyTrees();
          return;
        }
        const brandToggleBtn = event.target.closest('button[data-brand-toggle-id]');
        if (brandToggleBtn) {
          const brandId = Number(brandToggleBtn.dataset.brandToggleId || 0);
          if (!brandId) return;
          if (this.brandTreeExpanded.has(brandId)) this.brandTreeExpanded.delete(brandId);
          else this.brandTreeExpanded.add(brandId);
          this.renderTaxonomyTrees();
          return;
        }
        const btn = event.target.closest('button[data-taxonomy-action][data-id]');
        if (!btn) return;
        const action = String(btn.dataset.taxonomyAction || '');
        const itemId = Number(btn.dataset.id || 0);
        if (!itemId) return;
        if (action === 'edit-brand') this.editBrand(itemId);
        if (action === 'delete-brand') this.deleteBrand(itemId);
        if (action === 'edit-functional') this.editFunctionalCategory(itemId);
        if (action === 'delete-functional') this.deleteFunctionalCategory(itemId);
        if (action === 'edit-brand-category') this.editBrandCategory(itemId);
        if (action === 'delete-brand-category') this.deleteBrandCategory(itemId);
      });
    });
  }

  setupNavigation() {
    const links = document.querySelectorAll('.admin-nav .nav-link');
    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const href = String(link.getAttribute('href') || '');
        const page = href.replace(/^#\//, '').trim() || 'products';
        this.navigate(page);
      });
    });

    window.addEventListener('hashchange', () => {
      this.navigate(this.getPageFromHash(), true);
    });
  }

  getPageFromHash() {
    const raw = String(window.location.hash || '').replace(/^#\//, '').trim().toLowerCase();
    if (['products', 'categories', 'orders', 'settings'].includes(raw)) return raw;
    return 'products';
  }

  setHash(page, replace = false) {
    const target = `#/${page}`;
    if (replace) {
      const next = `${window.location.pathname}${window.location.search}${target}`;
      window.history.replaceState(null, '', next);
      return;
    }
    if (window.location.hash !== target) window.location.hash = target;
  }

  setActiveNav(page) {
    document.querySelectorAll('.admin-nav .nav-link').forEach((link) => {
      const href = String(link.getAttribute('href') || '').replace(/^#\//, '').trim();
      link.classList.toggle('active', href === page);
    });
  }

  showMainPage(page) {
    const ids = ['productsPage', 'categoriesPage', 'ordersPage', 'settingsPage'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === `${page}Page`) ? 'block' : 'none';
    });
    const productEditPage = document.getElementById('productEditPage');
    if (productEditPage) productEditPage.style.display = 'none';
  }

  async navigate(page, replaceHash = false) {
    const nextPage = ['products', 'categories', 'orders', 'settings'].includes(page) ? page : 'products';
    this.currentPage = nextPage;
    this.setHash(nextPage, replaceHash);
    this.setActiveNav(nextPage);
    this.showMainPage(nextPage);

    try {
      if (nextPage === 'products') {
        await this.loadProducts();
        return;
      }
      if (nextPage === 'categories') {
        await this.renderCategoriesPage();
        return;
      }
      if (nextPage === 'orders') {
        await this.loadOrdersPage();
        return;
      }
      if (nextPage === 'settings') {
        await this.renderSettingsPage();
      }
    } catch (err) {
      console.error(`Navigation error (${nextPage}):`, err);
      this.showError(`Ошибка загрузки страницы: ${err.message || err}`);
    }
  }

  setAdminToken(token) {
    this.adminToken = String(token || '').trim();
  }

  setupLoginGate() {
    const form = document.getElementById('adminLoginForm');
    if (form && !form.dataset.bound) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = document.getElementById('adminTokenInput');
        const button = document.getElementById('adminLoginBtn');
        const token = String(input?.value || '').trim();

        if (!token) {
          this.showLoginGateMessage('Введите ADMIN_TOKEN');
          return;
        }

        if (button) button.disabled = true;
        this.showLoginGateMessage('');

        try {
          await this.authenticateWithToken(token);
          if (input) input.value = '';
        } catch (error) {
          this.showLoginGateMessage(error.message || 'Не удалось выполнить вход');
        } finally {
          if (button) button.disabled = false;
        }
      });
      form.dataset.bound = '1';
    }
  }

  async bootstrapAdminSession() {
    try {
      const status = await this.fetchJson('/api/admin/session/status', {}, false);
      if (status?.authenticated) {
        this.isAuthenticated = true;
        this.hideLoginGate();
        this.updateAdminTokenUi();
        if (!this.isAppBootstrapped) {
          this.isAppBootstrapped = true;
          this.loadFilters();
          this.loadTaxonomyDictionaries();
          this.navigate(this.getPageFromHash(), true);
        }
        return;
      }
    } catch {
      // no active session
    }
    this.isAuthenticated = false;
    this.showLoginGate();
    this.updateAdminTokenUi();
  }

  async authenticateWithToken(token, { keepInputCleared = false, silentSuccess = false } = {}) {
    this.setAdminToken(token);
    await this.fetchJson('/api/admin/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }, false);
    this.isAuthenticated = true;
    this.hideLoginGate();
    this.updateAdminTokenUi();
    if (!this.isAppBootstrapped) {
      this.isAppBootstrapped = true;
      this.loadFilters();
      this.loadTaxonomyDictionaries();
      this.navigate(this.getPageFromHash(), true);
    } else {
      this.loadFilters();
      this.loadTaxonomyDictionaries();
      this.navigate(this.currentPage || this.getPageFromHash(), true);
    }
    if (!silentSuccess) this.showSuccess('Вход выполнен');
    if (!keepInputCleared) {
      const input = document.getElementById('adminTokenInput');
      if (input) input.value = '';
    }
  }

  showLoginGate(message = '') {
    const gate = document.getElementById('adminLoginGate');
    const app = document.getElementById('adminApp');
    if (gate) gate.style.display = 'flex';
    if (app) app.style.display = 'none';
    this.showLoginGateMessage(message);
  }

  hideLoginGate() {
    const gate = document.getElementById('adminLoginGate');
    const app = document.getElementById('adminApp');
    if (gate) gate.style.display = 'none';
    if (app) app.style.display = 'block';
    this.showLoginGateMessage('');
  }

  showLoginGateMessage(message) {
    const msg = document.getElementById('adminLoginMsg');
    if (!msg) return;
    msg.textContent = String(message || '');
  }

  async logoutAdmin() {
    try {
      await this.fetchJson('/api/admin/session/logout', { method: 'POST' }, false);
    } catch (error) {
      console.warn('admin logout warning:', error);
    }
    this.isAuthenticated = false;
    this.setAdminToken('');
    this.updateAdminTokenUi();
    this.showLoginGate('');
  }

  updateAdminTokenUi() {
    const tokenState = document.getElementById('adminTokenState');
    if (tokenState) {
      tokenState.textContent = this.isAuthenticated ? 'Token: active session' : 'Token: not set';
    }
  }

  async fetchJson(url, options = {}, allowAuthRetry = true) {
    const isAdminApi = /^\/api\/admin(\/|$)/.test(String(url || ''));
    const isAdminSessionApi = /^\/api\/admin\/session(\/|$)/.test(String(url || ''));

    const requestOptions = { ...(options || {}) };
    const headers = { ...(requestOptions.headers || {}) };
    if (this.adminToken && isAdminApi && !isAdminSessionApi && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.adminToken}`;
    }
    requestOptions.headers = headers;

    const response = await fetch(url, requestOptions);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const raw = await response.text();
    let data = {};

    if (raw) {
      const looksLikeJson = contentType.includes('application/json') || /^[\[{]/.test(raw.trim());
      if (looksLikeJson) {
        try {
          data = JSON.parse(raw);
        } catch {
          if (!response.ok) {
            throw new Error(`Сервер вернул некорректный JSON (HTTP ${response.status})`);
          }
          throw new Error('Сервер вернул некорректный JSON');
        }
      }
    }

    if (!response.ok) {
      const fallback = raw && !contentType.includes('application/json')
        ? `Сервер вернул не-JSON ответ (HTTP ${response.status})`
        : `HTTP ${response.status}`;
      const message = data?.error || data?.message || fallback;

      if (isAdminApi && !isAdminSessionApi && allowAuthRetry && (response.status === 401 || response.status === 403)) {
        this.isAuthenticated = false;
        this.updateAdminTokenUi();
        this.showLoginGate('Session expired. Please login again.');
      }

      if (isAdminApi && response.status === 503 && /auth is not configured/i.test(String(message))) {
        throw new Error('Admin auth is not configured on server. Set ADMIN_TOKEN or DISABLE_ADMIN_AUTH=1 and restart server.');
      }

      throw new Error(message);
    }

    return data;
  }

  async loadFilters() {
    try {
      const data = await this.fetchJson('/api/admin/filters');

      const brandFilter = document.getElementById('brandFilter');
      const categoryFilter = document.getElementById('categoryFilter');
      const groupFilter = document.getElementById('groupFilter');
      const productBrand = document.getElementById('productBrand');
      const productCategory = document.getElementById('productCategory');
      const productFunctionalCategories = document.getElementById('productFunctionalCategories');
      const productGroup = document.getElementById('productGroup');

      if (brandFilter) brandFilter.innerHTML = '<option value="">Все бренды</option>';
      if (categoryFilter) categoryFilter.innerHTML = '<option value="">Все функциональные категории</option>';
      if (groupFilter) {
        groupFilter.innerHTML = '<option value="">Сначала выберите категорию</option>';
        groupFilter.disabled = true;
      }
      if (productBrand && (!this.catalogTaxonomy.brands || !this.catalogTaxonomy.brands.length)) {
        productBrand.innerHTML = '<option value="">Выберите бренд</option>';
      }
      if (productCategory) productCategory.innerHTML = '<option value="">Выберите категорию</option>';
      if (productFunctionalCategories) {
        productFunctionalCategories.innerHTML = '<option value="">Сначала выберите категорию</option>';
        productFunctionalCategories.disabled = true;
      }
      if (productGroup) productGroup.innerHTML = '<option value="">Выберите подкатегорию</option>';

      this.availableFilters.brands = (data.brands || [])
        .map((b) => String(b.brand || '').trim())
        .filter(Boolean);
      const fixedCategoryOrder = this.getFunctionalCategoryOrder();
      this.functionalCategoryCounts = new Map();
      (data.categories || []).forEach((c) => {
        const name = String(c.category || '').trim();
        const count = Number(c.count || 0);
        if (!name) return;
        this.functionalCategoryCounts.set(name, count);
      });
      this.availableFilters.categories = fixedCategoryOrder.slice();
      this.categoryGroupsIndex = this.buildCategoryGroupsIndex(data.categoryGroups || []);
      this.availableFilters.groups = Array.from(
        new Set(
          Array.from(this.categoryGroupsIndex.values())
            .flatMap((rows) => rows.map((row) => String(row?.value || '').trim()))
            .filter(Boolean)
        )
      );

      data.brands.forEach((brand) => {
        if (brandFilter) brandFilter.add(new Option(`${brand.brand} (${brand.count})`, brand.brand));
        if (productBrand && (!this.catalogTaxonomy.brands || !this.catalogTaxonomy.brands.length)) {
          productBrand.add(new Option(brand.brand, brand.brand));
        }
      });

      this.availableFilters.categories.forEach((categoryName) => {
        const count = Number(this.functionalCategoryCounts.get(categoryName) || 0);
        if (categoryFilter) categoryFilter.add(new Option(`${categoryName} (${count})`, categoryName));
        if (productCategory) productCategory.add(new Option(categoryName, categoryName));
      });

      const normalizedGroupCounts = new Map();
      (data.groups || []).forEach((group) => {
        const value = this.normalizeFunctionalGroupName(group.group_name || '');
        if (!value) return;
        normalizedGroupCounts.set(value, (normalizedGroupCounts.get(value) || 0) + Number(group.count || 0));
      });
      [...normalizedGroupCounts.entries()]
        .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0]), 'ru'))
        .forEach(([value, count]) => {
          const label = `${value} (${count})`;
          if (groupFilter) groupFilter.add(new Option(label, value));
          if (productGroup) productGroup.add(new Option(value, value));
        });

      this.syncGroupFilterOptions();
      this.syncBrandCategoryFilterOptions();
      this.syncProductFunctionalSubcategories();

      if (productCategory && productFunctionalCategories) {
        if (!productCategory.dataset.functionalSyncBound) {
          productCategory.addEventListener('change', () => {
            this.syncProductFunctionalSubcategories();
          });
          productCategory.dataset.functionalSyncBound = '1';
        }
      }
    } catch (error) {
      console.error('Error loading filters:', error);
      this.showError(`Не удалось загрузить фильтры: ${error.message}`);
    }
  }

  buildCategoryGroupsIndex(categoryGroups) {
    const index = new Map();
    const fixedOrder = this.getFunctionalCategoryOrder();
    const subOrderMap = this.getFunctionalSubcategoryOrderMap();
    const rowsByCategory = new Map();
    for (const row of Array.isArray(categoryGroups) ? categoryGroups : []) {
      const category = String(row?.category || '').trim();
      if (!category) continue;
      rowsByCategory.set(category, Array.isArray(row?.groups) ? row.groups : []);
    }
    for (const category of fixedOrder) {
      const groups = rowsByCategory.get(category) || [];
      const groupedMap = new Map();
      for (const item of groups) {
        const value = this.normalizeFunctionalGroupName(item?.group_name);
        const count = Number(item?.count || 0);
        if (!value) continue;
        groupedMap.set(value, (groupedMap.get(value) || 0) + count);
      }
      const allowedOrder = Array.isArray(subOrderMap[category]) ? subOrderMap[category] : [];
      const allowedSet = new Set(allowedOrder);
      const mapped = [...groupedMap.entries()]
        .filter(([value, count]) => count > 0 && (!allowedSet.size || allowedSet.has(value)))
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => {
          const ai = allowedOrder.indexOf(a.value);
          const bi = allowedOrder.indexOf(b.value);
          const aOrder = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
          const bOrder = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return String(a.value).localeCompare(String(b.value), 'ru');
        });
      index.set(category, mapped);
    }
    return index;
  }

  normalizeFunctionalGroupName(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parts = raw.split('/').map((x) => String(x || '').trim()).filter(Boolean);
    if (parts.length < 2) return raw;
    const head = parts[0].toLocaleLowerCase('ru');
    const knownBrands = new Set(
      (this.availableFilters.brands || [])
        .map((b) => String(b || '').trim().toLocaleLowerCase('ru'))
        .filter(Boolean)
    );
    knownBrands.add('wiren board');
    knownBrands.add('wirenboard');
    knownBrands.add('loxone');
    knownBrands.add('larnitech');
    knownBrands.add('hite pro');
    knownBrands.add('hitepro');
    knownBrands.add('hite-pro');
    if (!knownBrands.has(head)) return raw;
    return parts.slice(1).join(' / ').trim();
  }

  syncGroupFilterOptions() {
    const categoryFilter = document.getElementById('categoryFilter');
    const groupFilter = document.getElementById('groupFilter');
    if (!groupFilter) return;

    const selectedCategory = String(categoryFilter?.value || '').trim();
    const selectedGroup = String(groupFilter.value || '').trim();
    if (!selectedCategory) {
      groupFilter.innerHTML = '<option value="">Сначала выберите категорию</option>';
      groupFilter.value = '';
      groupFilter.disabled = true;
      this.rebuildCategoryTreeFilter();
      this.syncCategoryTreeFilterValue();
      return;
    }

    const scopedGroups = this.categoryGroupsIndex.get(selectedCategory) || [];
    groupFilter.disabled = false;

    groupFilter.innerHTML = '<option value="">Все подкатегории</option>';
    for (const item of scopedGroups) {
      const value = String(item?.value || '').trim();
      if (!value) continue;
      const count = Number(item?.count || 0);
      const label = selectedCategory && count > 0 ? `${value} (${count})` : value;
      const opt = new Option(label, value);
      groupFilter.add(opt);
    }

    const canKeepSelection = selectedGroup && scopedGroups.some((item) => item.value === selectedGroup);
    if (canKeepSelection) {
      groupFilter.value = selectedGroup;
    } else {
      groupFilter.value = '';
    }

    this.rebuildCategoryTreeFilter();
    this.syncCategoryTreeFilterValue();
  }

  syncProductFunctionalSubcategories() {
    const productCategory = document.getElementById('productCategory');
    const productFunctionalCategories = document.getElementById('productFunctionalCategories');
    const productGroup = document.getElementById('productGroup');
    if (!productFunctionalCategories) return;

    const selectedCategory = String(productCategory?.value || '').trim();
    const currentSub = String(productFunctionalCategories.value || productGroup?.value || '').trim();

    if (!selectedCategory) {
      productFunctionalCategories.innerHTML = '<option value="">Сначала выберите категорию</option>';
      productFunctionalCategories.disabled = true;
      if (productGroup) {
        productGroup.innerHTML = '<option value="">Выберите подкатегорию</option>';
        productGroup.value = '';
      }
      return;
    }

    const scopedGroups = this.categoryGroupsIndex.get(selectedCategory) || [];
    productFunctionalCategories.disabled = false;
    productFunctionalCategories.innerHTML = '<option value="">Выберите подкатегорию</option>';
    if (productGroup) {
      productGroup.innerHTML = '<option value="">Выберите подкатегорию</option>';
    }

    for (const item of scopedGroups) {
      const value = String(item?.value || '').trim();
      if (!value) continue;
      productFunctionalCategories.add(new Option(value, value));
      if (productGroup) productGroup.add(new Option(value, value));
    }

    const canKeep = currentSub && scopedGroups.some((item) => String(item?.value || '').trim() === currentSub);
    productFunctionalCategories.value = canKeep ? currentSub : '';
    if (productGroup) productGroup.value = canKeep ? currentSub : '';
  }

  rebuildCategoryTreeFilter() {
    const treeFilter = document.getElementById('categoryTreeFilter');
    if (!treeFilter) return;

    const selectedValue = String(treeFilter.value || '');
    treeFilter.innerHTML = '<option value="">Все функциональные категории и подкатегории</option>';

    const categories = Array.from(new Set((this.availableFilters.categories || []).filter(Boolean)))
      .sort((a, b) => String(a).localeCompare(String(b), 'ru'));
    for (const category of categories) {
      treeFilter.add(new Option(String(category), `c::${encodeURIComponent(category)}`));
      const groups = this.categoryGroupsIndex.get(category) || [];
      for (const group of groups) {
        const g = String(group?.value || '').trim();
        if (!g) continue;
        const label = `└ ${g}`;
        treeFilter.add(new Option(label, `g::${encodeURIComponent(category)}::${encodeURIComponent(g)}`));
      }
    }

    const exists = Array.from(treeFilter.options).some((o) => o.value === selectedValue);
    treeFilter.value = exists ? selectedValue : '';
  }

  syncCategoryTreeFilterValue() {
    const treeFilter = document.getElementById('categoryTreeFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const groupFilter = document.getElementById('groupFilter');
    if (!treeFilter) return;

    const category = String(categoryFilter?.value || '').trim();
    const group = String(groupFilter?.value || '').trim();
    if (!category) {
      treeFilter.value = '';
      return;
    }
    const target = group
      ? `g::${encodeURIComponent(category)}::${encodeURIComponent(group)}`
      : `c::${encodeURIComponent(category)}`;
    const exists = Array.from(treeFilter.options).some((o) => o.value === target);
    treeFilter.value = exists ? target : '';
  }

  applyCategoryTreeFilter() {
    const treeFilter = document.getElementById('categoryTreeFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const groupFilter = document.getElementById('groupFilter');
    if (!treeFilter || !categoryFilter || !groupFilter) return;

    const raw = String(treeFilter.value || '');
    if (!raw) {
      categoryFilter.value = '';
      groupFilter.value = '';
      return;
    }
    if (raw.startsWith('c::')) {
      const category = decodeURIComponent(raw.slice(3));
      categoryFilter.value = category;
      this.syncGroupFilterOptions();
      groupFilter.value = '';
      return;
    }
    if (raw.startsWith('g::')) {
      const parts = raw.split('::');
      const category = decodeURIComponent(parts[1] || '');
      const group = decodeURIComponent(parts[2] || '');
      categoryFilter.value = category;
      this.syncGroupFilterOptions();
      groupFilter.value = group;
    }
  }

  async loadTaxonomyDictionaries() {
    try {
      const [brandsResult, functionalResult, brandCatsResult] = await Promise.all([
        this.fetchJson('/api/admin/brands'),
        this.fetchJson('/api/admin/functional-categories'),
        this.fetchJson('/api/admin/brand-categories')
      ]);
      this.catalogTaxonomy.brands = Array.isArray(brandsResult?.brands) ? brandsResult.brands : [];
      this.catalogTaxonomy.functionalCategories = Array.isArray(functionalResult?.categories) ? functionalResult.categories : [];
      this.catalogTaxonomy.brandCategories = Array.isArray(brandCatsResult?.categories) ? brandCatsResult.categories : [];
      this.functionalTreeSeeded = false;
      this.brandTreeExpanded.clear();
      this.populateBrandTaxonomySelectors();
      this.renderTaxonomyTrees();
    } catch (error) {
      console.error('Taxonomy dictionaries load error:', error);
    }
  }

  getBrandCategoryLabelMap() {
    const brandsById = new Map((this.catalogTaxonomy.brands || []).map((b) => [Number(b.id), String(b.name || '')]));
    const categories = Array.isArray(this.catalogTaxonomy.brandCategories) ? this.catalogTaxonomy.brandCategories : [];
    const byId = new Map(categories.map((c) => [Number(c.id), c]));
    const labelById = new Map();
    const build = (id) => {
      const key = Number(id);
      if (!Number.isFinite(key) || key <= 0) return '';
      if (labelById.has(key)) return labelById.get(key);
      const row = byId.get(key);
      if (!row) return '';
      const parentLabel = row.parentId ? build(row.parentId) : '';
      const own = String(row.name || '').trim();
      const brandPrefix = row.parentId ? '' : `${brandsById.get(Number(row.brandId)) || row.brandName || ''} / `;
      const label = `${parentLabel ? `${parentLabel} / ` : brandPrefix}${own}`.trim();
      labelById.set(key, label);
      return label;
    };
    for (const c of categories) build(c.id);
    return labelById;
  }

  syncCreateFunctionalParentOptions() {
    const parentSelect = document.getElementById('newFunctionalCategoryParentId');
    if (!parentSelect) return;

    const current = String(parentSelect.value || '');
    parentSelect.innerHTML = '';
    parentSelect.add(new Option('Выберите функциональную категорию (из 8)', ''));

    const roots = (this.catalogTaxonomy.functionalCategories || [])
      .filter((row) => Number(row?.parentId || 0) <= 0);
    const rootByNormName = new Map(
      roots.map((row) => [this.normalizeText(String(row?.name || '')), row])
    );
    this.getFunctionalCategoryOrder().forEach((name) => {
      const row = rootByNormName.get(this.normalizeText(name));
      if (!row) return;
      parentSelect.add(new Option(name, String(row.id || '')));
    });

    if (Array.from(parentSelect.options).some((o) => o.value === current)) {
      parentSelect.value = current;
    } else {
      parentSelect.value = '';
    }
  }

  setCategoriesDictionaryTab(tab) {
    const allowed = new Set(['functional', 'brands']);
    const next = allowed.has(tab) ? tab : 'functional';
    this.categoriesDictionaryTab = next;

    const panes = {
      functional: document.getElementById('taxonomyPaneFunctional'),
      brands: document.getElementById('taxonomyPaneBrands')
    };
    Object.entries(panes).forEach(([key, el]) => {
      if (!el) return;
      el.style.display = key === next ? 'block' : 'none';
    });

    document.querySelectorAll('[data-taxonomy-tab]').forEach((btn) => {
      const isActive = String(btn.dataset.taxonomyTab || '') === next;
      btn.classList.toggle('active', isActive);
    });

    this.applyCategoriesDictionarySearch();
  }

  applyCategoriesDictionarySearch() {
    const input = document.getElementById('categoriesDictionarySearch');
    const term = String(input?.value || '').trim().toLocaleLowerCase('ru');
    const paneIdByTab = {
      functional: 'taxonomyPaneFunctional',
      brands: 'taxonomyPaneBrands'
    };
    const pane = document.getElementById(paneIdByTab[this.categoriesDictionaryTab] || '');
    if (!pane) return;

    const rows = Array.from(pane.querySelectorAll('tbody tr'));
    rows.forEach((row) => {
      if (!term) {
        row.style.display = '';
        return;
      }
      const text = String(row.textContent || '').toLocaleLowerCase('ru');
      row.style.display = text.includes(term) ? '' : 'none';
    });
  }

  populateBrandTaxonomySelectors() {
    const createBrandSelect = document.getElementById('newBrandCategoryBrandId');
    const productBrand = document.getElementById('productBrand');
    if (productBrand) {
      const selected = String(productBrand.value || '');
      productBrand.innerHTML = '<option value="">Выберите бренд</option>';
      (this.catalogTaxonomy.brands || []).forEach((b) => {
        const name = String(b.name || '');
        const opt = new Option(name, name);
        opt.selected = selected === name;
        productBrand.add(opt);
      });
    }
    if (createBrandSelect) {
      const selectedBrandId = String(createBrandSelect.value || '');
      createBrandSelect.innerHTML = '<option value="">Выберите бренд</option>';
      (this.catalogTaxonomy.brands || []).forEach((b) => {
        const id = String(b.id || '');
        const opt = new Option(String(b.name || ''), id);
        opt.selected = selectedBrandId === id;
        createBrandSelect.add(opt);
      });
    }

    this.syncCreateFunctionalParentOptions();
    this.syncBrandCategoryFilterOptions();
    this.syncProductBrandCategoryOptions();
  }

  async syncProductBrandCategoryOptions() {
    const productBrand = document.getElementById('productBrand');
    const productPrimaryBrandCategory = document.getElementById('productPrimaryBrandCategory');
    const productBrandCategories = document.getElementById('productBrandCategories');
    if (!productPrimaryBrandCategory) return;

    const selectedBrand = String(productBrand?.value || '').trim();
    const currentPrimary = String(productPrimaryBrandCategory.value || '');
    const labelById = this.getBrandCategoryLabelMap();

    if (productBrandCategories) {
      productBrandCategories.innerHTML = '';
      productBrandCategories.disabled = true;
    }

    productPrimaryBrandCategory.innerHTML = '';
    if (!selectedBrand) {
      productPrimaryBrandCategory.add(new Option('Сначала выберите бренд', ''));
      productPrimaryBrandCategory.disabled = true;
      return;
    }

    const selectedBrandLower = selectedBrand.toLocaleLowerCase('ru');
    const brandRow = (this.catalogTaxonomy.brands || []).find((row) => {
      const name = String(row?.name || '').trim();
      return name.toLocaleLowerCase('ru') === selectedBrandLower;
    });
    const brandId = Number(brandRow?.id || 0);

    const options = (this.catalogTaxonomy.brandCategories || [])
      .filter((row) => {
        const rowBrandId = Number(row?.brandId || 0);
        if (brandId > 0 && rowBrandId === brandId) return true;
        if (rowBrandId > 0) return false;
        const rowBrandName = String(row?.brandName || '').trim().toLocaleLowerCase('ru');
        return rowBrandName === selectedBrandLower;
      })
      .map((row) => ({
        id: String(row?.id || ''),
        label: labelById.get(Number(row?.id || 0)) || String(row?.name || '').trim()
      }))
      .filter((row) => row.id && row.label)
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));

    if (!options.length) {
      const nativeCategories = await this.getBrandScopedCategories(selectedBrand);
      if (!nativeCategories.length) {
        productPrimaryBrandCategory.add(new Option('У выбранного бренда нет категорий', ''));
        productPrimaryBrandCategory.disabled = true;
        return;
      }

      productPrimaryBrandCategory.disabled = false;
      productPrimaryBrandCategory.add(new Option('Выберите категорию бренда', ''));
      nativeCategories.forEach((name) => {
        const value = `native::${name}`;
        const opt = new Option(name, value);
        opt.selected = value === currentPrimary;
        productPrimaryBrandCategory.add(opt);
      });
      if (!nativeCategories.some((name) => `native::${name}` === currentPrimary)) {
        productPrimaryBrandCategory.value = '';
      }
      return;
    }

    productPrimaryBrandCategory.disabled = false;
    productPrimaryBrandCategory.add(new Option('Выберите категорию бренда', ''));
    options.forEach((row) => {
      const opt = new Option(row.label, row.id);
      opt.selected = row.id === currentPrimary;
      productPrimaryBrandCategory.add(opt);
      if (productBrandCategories) {
        productBrandCategories.add(new Option(row.label, row.id));
      }
    });
    if (!options.some((row) => row.id === currentPrimary)) {
      productPrimaryBrandCategory.value = '';
    }
  }

  async getBrandScopedCategories(brandName) {
    const key = String(brandName || '').trim();
    if (!key) return [];
    if (this.brandCategoryFallbackCache.has(key)) return this.brandCategoryFallbackCache.get(key);

    const localMap = {
      'Wiren Board': ['Датчики', 'Электросчетчики', 'Комплектующие', 'Контроллеры', 'Реле и диммеры', 'Прочее', 'HMI'],
      'Loxone': ['Аксессуары', 'Аудио / Multiroom', 'Реле и диммеры', 'Энергомониторинг', 'Датчики'],
      'Larnitech': ['Серия Metaforsa', 'DIN-реечное оборудование', 'Оборудование для подрозетных коробок', 'Датчики', 'Multiroom', 'Wireless'],
      'Hite Pro': ['Датчики', 'Комплекты', 'Реле и диммеры', 'Контроллеры', 'Аксессуары']
    };
    const localCategories = Array.isArray(localMap[key]) ? localMap[key] : [];
    if (localCategories.length) {
      this.brandCategoryFallbackCache.set(key, localCategories);
      return localCategories;
    }

    try {
      const data = await this.fetchJson(`/api/admin/brand-native-categories?brand=${encodeURIComponent(key)}`);
      const raw = Array.isArray(data?.categories) ? data.categories : [];
      const categories = Array.from(new Set(raw
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          return String(item?.name || '').trim();
        })
        .filter(Boolean)))
        .sort((a, b) => String(a).localeCompare(String(b), 'ru'));
      this.brandCategoryFallbackCache.set(key, categories);
      return categories;
    } catch (error) {
      console.warn('brand categories fallback load error:', error);
      this.brandCategoryFallbackCache.set(key, []);
      return [];
    }
  }

  async syncBrandCategoryFilterOptions() {
    const brandFilter = document.getElementById('brandFilter');
    const brandCategoryFilter = document.getElementById('brandCategoryFilter');
    if (!brandCategoryFilter) return;

    const selectedBrand = String(brandFilter?.value || '').trim();
    const currentValue = String(brandCategoryFilter.value || '').trim();
    const labelById = this.getBrandCategoryLabelMap();

    brandCategoryFilter.innerHTML = '';
    if (!selectedBrand) {
      brandCategoryFilter.add(new Option('Сначала выберите бренд', ''));
      brandCategoryFilter.value = '';
      brandCategoryFilter.disabled = true;
      return;
    }

    const selectedBrandLower = selectedBrand.toLocaleLowerCase('ru');
    const brandRow = (this.catalogTaxonomy.brands || []).find((row) => {
      const name = String(row?.name || '').trim();
      return name.toLocaleLowerCase('ru') === selectedBrandLower;
    });
    const brandId = Number(brandRow?.id || 0);

    const nativeCategories = await this.getBrandScopedCategories(selectedBrand);
    if (nativeCategories.length) {
      brandCategoryFilter.disabled = false;
      brandCategoryFilter.add(new Option('Все категории бренда', ''));
      for (const name of nativeCategories) {
        const opt = new Option(name, name);
        opt.selected = currentValue === name;
        brandCategoryFilter.add(opt);
      }
      if (!nativeCategories.includes(currentValue)) brandCategoryFilter.value = '';
      return;
    }

    const options = (this.catalogTaxonomy.brandCategories || [])
      .filter((row) => {
        const rowBrandId = Number(row?.brandId || 0);
        if (brandId > 0 && rowBrandId === brandId) return true;
        if (rowBrandId > 0) return false;
        const rowBrandName = String(row?.brandName || '').trim().toLocaleLowerCase('ru');
        return rowBrandName === selectedBrandLower;
      })
      .map((row) => ({
        id: String(row?.id || ''),
        label: labelById.get(Number(row?.id || 0)) || String(row?.name || '').trim()
      }))
      .filter((row) => row.id && row.label)
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));

    if (options.length) {
      brandCategoryFilter.disabled = false;
      brandCategoryFilter.add(new Option('Все брендовые категории', ''));
      for (const row of options) {
        const opt = new Option(row.label, row.id);
        opt.selected = currentValue === row.id;
        brandCategoryFilter.add(opt);
      }
      if (!options.some((row) => row.id === currentValue)) {
        brandCategoryFilter.value = '';
      }
      return;
    }

    brandCategoryFilter.add(new Option('У выбранного бренда нет категорий', ''));
    brandCategoryFilter.value = '';
    brandCategoryFilter.disabled = true;
  }

  renderTaxonomyTrees() {
    const brandsBody = document.getElementById('brandsTreeBody');
    const functionalBody = document.getElementById('functionalTreeBody');
    const brandBody = document.getElementById('brandTreeBody');

    if (brandsBody) {
      const rows = this.catalogTaxonomy.brands || [];
      const categories = this.catalogTaxonomy.brandCategories || [];
      const categoriesByBrand = new Map();
      categories.forEach((row) => {
        const brandId = Number(row.brandId || 0);
        if (!brandId) return;
        const list = categoriesByBrand.get(brandId) || [];
        list.push(row);
        categoriesByBrand.set(brandId, list);
      });
      for (const list of categoriesByBrand.values()) {
        list.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ru'));
      }

      if (!rows.length) {
        brandsBody.innerHTML = '<tr><td style="padding:16px;color:#64748b;">Нет данных</td></tr>';
      } else {
        const parts = [];
        rows.forEach((b) => {
          const brandId = Number(b.id || 0);
          const children = categoriesByBrand.get(brandId) || [];
          const expanded = this.brandTreeExpanded.has(brandId);
          const toggle = children.length
            ? `<button type="button" class="taxonomy-tree-toggle" data-brand-toggle-id="${brandId}" aria-label="${expanded ? 'Свернуть' : 'Развернуть'}">${expanded ? '▾' : '▸'}</button>`
            : '<span class="taxonomy-tree-spacer"></span>';
          parts.push(`
            <tr>
              <td>
                ${toggle}#${b.id} ${this.escapeHtml(b.name || '')}
                <span style="float:right;display:flex;gap:6px;">
                  <button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="edit-brand" data-id="${b.id}">Ред</button>
                  <button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="delete-brand" data-id="${b.id}">Удалить</button>
                </span>
              </td>
            </tr>
          `);
          if (children.length && expanded) {
            parts.push(children.map((row) => `
              <tr>
                <td style="padding-left:36px;">
                  ${this.escapeHtml(row.name || '')}
                  <span style="float:right;display:flex;gap:6px;">
                    <button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="edit-brand-category" data-id="${row.id}">Ред</button>
                    <button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="delete-brand-category" data-id="${row.id}">Удалить</button>
                  </span>
                </td>
              </tr>
            `).join(''));
          }
        });
        brandsBody.innerHTML = parts.join('');
      }
    }

    if (functionalBody) {
      functionalBody.innerHTML = this.renderCategoryTreeRows(
        this.catalogTaxonomy.functionalCategories || [],
        (x) => Number(x.parentId || 0),
        0,
        'functional'
      );
    }

    if (brandBody) {
      const brandsById = new Map((this.catalogTaxonomy.brands || []).map((b) => [Number(b.id), String(b.name || '')]));
      const rows = this.catalogTaxonomy.brandCategories || [];
      const grouped = new Map();
      rows.forEach((row) => {
        const brandId = Number(row.brandId || 0);
        const arr = grouped.get(brandId) || [];
        arr.push(row);
        grouped.set(brandId, arr);
      });
      const parts = [];
      for (const [brandId, categories] of grouped.entries()) {
        const brandName = brandsById.get(brandId) || `Brand #${brandId}`;
        parts.push(`<tr><td><strong>${this.escapeHtml(brandName)}</strong></td></tr>`);
        const sorted = [...categories].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ru'));
        parts.push(sorted.map((row) => `
          <tr>
            <td style="padding-left:36px;">
              ${this.escapeHtml(row.name || '')}
              <span style="float:right;display:flex;gap:6px;">
                <button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="edit-brand-category" data-id="${row.id}">Ред</button>
                <button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="delete-brand-category" data-id="${row.id}">Удалить</button>
              </span>
            </td>
          </tr>
        `).join(''));
      }
      brandBody.innerHTML = parts.length ? parts.join('') : '<tr><td style="padding:16px;color:#64748b;">Нет данных</td></tr>';
    }

    this.applyCategoriesDictionarySearch();
  }

  renderCategoryTreeRows(rows, parentSelector, baseDepth = 0, actionType = '') {
    if (!Array.isArray(rows) || !rows.length) {
      return '<tr><td style="padding:16px;color:#64748b;">Нет данных</td></tr>';
    }

    const childrenByParent = new Map();
    rows.forEach((row) => {
      const parentId = Number(parentSelector(row) || 0);
      const list = childrenByParent.get(parentId) || [];
      list.push(row);
      childrenByParent.set(parentId, list);
    });

    for (const list of childrenByParent.values()) {
      list.sort((a, b) => {
        const as = Number(a.sortOrder || 0);
        const bs = Number(b.sortOrder || 0);
        if (as !== bs) return as - bs;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
      });
    }

    if (actionType === 'functional' && !this.functionalTreeSeeded) {
      this.functionalTreeExpanded.clear();
      this.functionalTreeSeeded = true;
    }

    const render = (parentId, depth) => {
      const list = childrenByParent.get(Number(parentId || 0)) || [];
      return list.map((row) => {
        const pad = 16 + depth * 20;
        const id = Number(row.id || 0);
        const hasChildren = (childrenByParent.get(id) || []).length > 0;
        const isExpanded = this.functionalTreeExpanded.has(id);

        const toggleControl = actionType === 'functional'
          ? hasChildren
            ? '<button type="button" class="taxonomy-tree-toggle" data-tree-toggle-id="' + id + '" aria-label="' + (isExpanded ? 'Свернуть' : 'Развернуть') + '">' + (isExpanded ? '▾' : '▸') + '</button>'
            : '<span class="taxonomy-tree-spacer"></span>'
          : '';

        const actionButtons = actionType === 'functional'
          ? '<span style="float:right;display:flex;gap:6px;"><button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="edit-functional" data-id="' + row.id + '">Ред</button><button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="delete-functional" data-id="' + row.id + '">Удалить</button></span>'
          : actionType === 'brandCategory'
            ? '<span style="float:right;display:flex;gap:6px;"><button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="edit-brand-category" data-id="' + row.id + '">Ред</button><button type="button" class="btn btn-outline btn-xs" data-taxonomy-action="delete-brand-category" data-id="' + row.id + '">Удалить</button></span>'
            : '';

        const me = '<tr><td style="padding-left:' + pad + 'px;">' + toggleControl + '#' + row.id + ' ' + this.escapeHtml(row.name || '') + actionButtons + '</td></tr>';
        const kids = (actionType === 'functional' && hasChildren && !isExpanded) ? '' : render(row.id, depth + 1);
        return me + kids;
      }).join('');
    };

    return render(0, baseDepth);
  }

  async renderCategoriesPage() {
    if (!this.catalogTaxonomy.brands.length && !this.catalogTaxonomy.functionalCategories.length) {
      await this.loadTaxonomyDictionaries();
    } else {
      this.renderTaxonomyTrees();
    }
    this.setCategoriesDictionaryTab(this.categoriesDictionaryTab);

    const tbody = document.getElementById('categoriesTableBody');
    const brandsBody = document.getElementById('brandsSummaryBody');
    const brandsSection = document.getElementById('brandsSummarySection');
    const head = document.getElementById('categoriesTableHead');
    const modeSelect = document.getElementById('categoriesViewMode');
    if (!tbody || !head) return;

    const modeRaw = modeSelect ? String(modeSelect.value || '') : this.categoriesViewMode;
    this.categoriesViewMode = ['brand', 'function', 'all'].includes(modeRaw) ? modeRaw : 'brand';
    if (modeSelect && modeSelect.value !== this.categoriesViewMode) modeSelect.value = this.categoriesViewMode;

    const source = await this.loadAllProductsForSummary();
    const products = source.filter((p) => {
      const brand = String(p.brand || '').trim();
      if (!brand) return false;
      const category = String(p.category || '').trim();
      return this.normalizeText(category) !== this.normalizeText('Услуги');
    });

    const brandMap = new Map();
    const functionMap = new Map();
    const flatRows = [];

    for (const p of products) {
      const id = Number(p.id || 0);
      const brand = String(p.brand || '').trim();
      const category = String(p.category || '').trim() || 'Без категории';
      const rawGroup = String(p.group || p.groupName || '').trim();
      const group = this.normalizeGroupName(rawGroup, brand) || '—';
      const article = String(p.article || '').trim() || '—';
      const name = String(p.name || '').trim() || '—';
      const status = String(p.status || 'active').trim() || 'active';

      brandMap.set(brand, (brandMap.get(brand) || 0) + 1);

      const fnKey = category + '||' + group;
      const fnRec = functionMap.get(fnKey) || { category, group, count: 0, brands: new Set() };
      fnRec.count += 1;
      fnRec.brands.add(brand);
      functionMap.set(fnKey, fnRec);

      flatRows.push({ id, brand, category, group, article, name, status });
    }

    const brandRows = [...brandMap.entries()]
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => (b.count - a.count) || a.brand.localeCompare(b.brand, 'ru'));

    if (brandsBody) {
      brandsBody.innerHTML = brandRows.length
        ? brandRows.map((r) => '<tr><td>' + this.escapeHtml(r.brand) + '</td><td>' + r.count + '</td></tr>').join('')
        : '<tr><td colspan="2" style="text-align:center;padding:24px;">Бренды не найдены</td></tr>';
    }

    if (this.categoriesViewMode === 'brand') {
      if (brandsSection) brandsSection.style.display = 'block';
      head.innerHTML = '<tr><th>Бренд</th><th>Категория</th><th>Подкатегория</th><th>Товаров</th></tr>';

      const brandCategoryMap = new Map();
      for (const p of products) {
        const brand = String(p.brand || '').trim();
        const category = String(p.category || '').trim() || 'Без категории';
        const group = this.normalizeGroupName(String(p.group || p.groupName || '').trim(), brand) || '—';
        const key = brand + '||' + category + '||' + group;
        brandCategoryMap.set(key, {
          brand,
          category,
          group,
          count: (brandCategoryMap.get(key)?.count || 0) + 1
        });
      }

      const rowsSorted = [...brandCategoryMap.values()]
        .sort((a, b) => (a.brand.localeCompare(b.brand, 'ru') || a.category.localeCompare(b.category, 'ru') || a.group.localeCompare(b.group, 'ru')));

      tbody.innerHTML = rowsSorted.length
        ? rowsSorted.map((r) => '<tr><td>' + this.escapeHtml(r.brand) + '</td><td>' + this.escapeHtml(r.category) + '</td><td>' + this.escapeHtml(r.group) + '</td><td>' + r.count + '</td></tr>').join('')
        : '<tr><td colspan="4" style="text-align:center;padding:32px;">Категории не найдены</td></tr>';
      return;
    }

    if (brandsSection) brandsSection.style.display = 'none';

    if (this.categoriesViewMode === 'function') {
      const functionRows = [...functionMap.values()]
        .sort((a, b) => (a.category.localeCompare(b.category, 'ru') || a.group.localeCompare(b.group, 'ru')));
      head.innerHTML = '<tr><th>Категория</th><th>Подкатегория</th><th>Брендов</th><th>Товаров</th></tr>';
      tbody.innerHTML = functionRows.length
        ? functionRows.map((r) => '<tr><td>' + this.escapeHtml(r.category) + '</td><td>' + this.escapeHtml(r.group) + '</td><td>' + r.brands.size + '</td><td>' + r.count + '</td></tr>').join('')
        : '<tr><td colspan="4" style="text-align:center;padding:32px;">Категории не найдены</td></tr>';
      return;
    }

    flatRows.sort((a, b) => (a.brand.localeCompare(b.brand, 'ru') || a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru')));
    head.innerHTML = '<tr><th>ID</th><th>Бренд</th><th>Категория</th><th>Подкатегория</th><th>SKU</th><th>Название</th><th>Статус</th></tr>';
    tbody.innerHTML = flatRows.length
      ? flatRows.map((r) => '<tr><td>' + (r.id || '—') + '</td><td>' + this.escapeHtml(r.brand) + '</td><td>' + this.escapeHtml(r.category) + '</td><td>' + this.escapeHtml(r.group) + '</td><td>' + this.escapeHtml(r.article) + '</td><td>' + this.escapeHtml(r.name) + '</td><td>' + this.escapeHtml(r.status) + '</td></tr>').join('')
      : '<tr><td colspan="7" style="text-align:center;padding:32px;">Товары не найдены</td></tr>';
  }

  async loadAllProductsForSummary() {
    if (Array.isArray(this.summaryProducts) && this.summaryProducts.length) return this.summaryProducts;
    const out = [];
    const pageLimit = 500;
    let offset = 0;
    let guard = 0;
    while (guard < 30) {
      guard += 1;
      const data = await this.fetchJson(`/api/admin/products?limit=${pageLimit}&offset=${offset}`);
      const rows = Array.isArray(data.products) ? data.products : (Array.isArray(data.rows) ? data.rows : []);
      out.push(...rows);
      const pagination = data.pagination || {};
      const hasMore = Boolean(pagination.hasMore);
      if (!hasMore || rows.length === 0) break;
      offset += pageLimit;
    }
    this.summaryProducts = out;
    return out;
  }

  normalizeGroupName(group, brand) {
    let s = String(group || '').trim();
    if (!s) return '';
    const brandName = String(brand || '').trim();
    if (brandName) {
      const escaped = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(`^${escaped}\\s*\\/\\s*`, 'i'), '');
    }
    s = s.replace(/^[^—]*—\s*/, '');
    const parts = s.split('/').map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) s = parts[parts.length - 1];
    return s.trim();
  }

  changeCategoriesViewMode() {
    this.renderCategoriesPage().catch((err) => {
      console.error('Categories render error:', err);
      this.showError(`Ошибка обновления категорий: ${err.message || err}`);
    });
  }

  hasMojibakeMarkers(value) {
    const text = String(value || '');
    return /(?:\u0420[\u0400-\u04ff]|\u0421[\u0400-\u04ff]|\u00d0.|\u00d1.|\u00c3.|\ufffd)/.test(text);
  }

  cp1251ByteFromChar(ch) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7f) return code;
    if (code >= 0xa0 && code <= 0xbf) return code;
    const cp1251Special = {
      0x0402: 0x80,
      0x0403: 0x81,
      0x201a: 0x82,
      0x0453: 0x83,
      0x201e: 0x84,
      0x2020: 0x86,
      0x2021: 0x87,
      0x2030: 0x89,
      0x0409: 0x8a,
      0x2039: 0x8b,
      0x040a: 0x8c,
      0x040c: 0x8d,
      0x040e: 0x8e,
      0x040f: 0x8f,
      0x0452: 0x90,
      0x2018: 0x91,
      0x2019: 0x92,
      0x201c: 0x93,
      0x201d: 0x94,
      0x2022: 0x95,
      0x2013: 0x96,
      0x2014: 0x97,
      0x2122: 0x99,
      0x0459: 0x9a,
      0x203a: 0x9b,
      0x045a: 0x9c,
      0x045c: 0x9d,
      0x045e: 0xa2,
      0x045f: 0x9f,
      0x0406: 0xb2,
      0x0456: 0xb3,
      0x0407: 0xaf,
      0x0457: 0xbf,
      0x0490: 0xa5,
      0x0491: 0xb4,
      0x0455: 0xbe,
      0x0454: 0xba,
      0x0404: 0xaa
    };
    if (cp1251Special[code] !== undefined) return cp1251Special[code];
    if (code === 0x0401) return 0xa8;
    if (code === 0x0451) return 0xb8;
    if (code >= 0x0410 && code <= 0x044f) return code - 0x350;
    if (code === 0x2116) return 0xb9;
    if (code === 0x2026) return 0x85;
    if (code === 0x20ac) return 0x88;
    return null;
  }

  tryFixMojibake(value) {
    const text = String(value || '');
    if (!this.hasMojibakeMarkers(text)) return text;
    const bytes = [];
    for (const ch of text) {
      const b = this.cp1251ByteFromChar(ch);
      if (b === null) return text;
      bytes.push(b);
    }
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
      return decoded || text;
    } catch {
      return text;
    }
  }

  displayText(value) {
    return this.tryFixMojibake(value)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  escapeHtml(value) {
    return this.displayText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getOrderStatusMeta(status) {
    const key = String(status || '').trim();
    const map = {
      new: { text: 'Новый', css: 'order-new' },
      in_work: { text: 'В работе', css: 'order-in-work' },
      paid: { text: 'Оплачен', css: 'order-paid' },
      shipped: { text: 'Отгружен', css: 'order-shipped' },
      completed: { text: 'Завершен', css: 'order-completed' },
      cancelled: { text: 'Отменен', css: 'order-cancelled' }
    };
    return map[key] || { text: key || '-', css: 'order-unknown' };
  }

  getPaymentStatusMeta(status) {
    const key = String(status || '').trim();
    const map = {
      unpaid: { text: 'Не оплачен', css: 'payment-unpaid' },
      paid: { text: 'Оплачен', css: 'payment-paid' },
      partial: { text: 'Частично оплачен', css: 'payment-partial' },
      refund: { text: 'Возврат', css: 'payment-refund' }
    };
    return map[key] || { text: key || '-', css: 'payment-unknown' };
  }

  formatOrderStatusBadge(status) {
    const meta = this.getOrderStatusMeta(status);
    return `<span class="status-badge ${meta.css}">${this.escapeHtml(meta.text)}</span>`;
  }

  formatPaymentStatusBadge(status) {
    const meta = this.getPaymentStatusMeta(status);
    return `<span class="status-badge ${meta.css}">${this.escapeHtml(meta.text)}</span>`;
  }

  getPaymentMethodLabel(method) {
    const key = String(method || '').trim();
    const map = {
      card_on_delivery: 'Картой при получении',
      cash_on_delivery: 'Наличными при получении',
      card: 'Картой',
      cash: 'Наличными',
      invoice: 'Счет',
      sbp: 'СБП'
    };
    return map[key] || key || '-';
  }

  getDeliveryMethodLabel(method) {
    const key = String(method || '').trim();
    const map = {
      courier: 'Курьер',
      pickup: 'Самовывоз',
      transport: 'Транспортная компания'
    };
    return map[key] || key || '-';
  }

  async loadOrdersPage() {
    try {
      const params = new URLSearchParams({
        limit: 200,
        offset: 0,
        ...this.ordersFilters
      });
      const data = await this.fetchJson(`/api/admin/orders?${params.toString()}`);
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const tbody = document.getElementById('ordersTableBody');
      const countEl = document.getElementById('ordersCount');
      if (countEl) countEl.textContent = `${Number(data.total || rows.length)} заказов`;
      if (!tbody) return;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:32px;">Заказы пока отсутствуют</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((o) => `
        <tr>
          <td>${this.escapeHtml(o.id ?? '')}</td>
          <td>${this.escapeHtml(this.formatDateTime(o.createdAt))}</td>
          <td>${this.escapeHtml(o.customerName || '')}</td>
          <td>${this.escapeHtml(o.customerPhone || '')}</td>
          <td>${this.escapeHtml(o.customerAddress || '')}</td>
          <td>${this.escapeHtml(this.getPaymentMethodLabel(o.paymentMethod))}</td>
          <td>${this.formatPaymentStatusBadge(o.paymentStatus)}</td>
          <td>${this.escapeHtml(this.getDeliveryMethodLabel(o.deliveryMethod))}</td>
          <td>${this.escapeHtml(o.manager || '')}</td>
          <td>${this.escapeHtml(o.itemCount ?? 0)}</td>
          <td>${this.escapeHtml(this.formatPrice(o.total))}</td>
          <td>${this.formatOrderStatusBadge(o.status)}</td>
          <td>
            <div class="action-buttons">
              <button type="button" class="btn-action" data-order-action="details" data-id="${this.escapeHtml(String(o.id || ''))}">Детали</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      this.showError(`Ошибка загрузки заказов: ${error.message}`);
    }
  }

  applyOrdersFilters() {
    const next = {
      search: document.getElementById('ordersSearchInput')?.value || '',
      status: document.getElementById('ordersStatusFilter')?.value || '',
      paymentStatus: document.getElementById('ordersPaymentStatusFilter')?.value || '',
      paymentMethod: document.getElementById('ordersPaymentFilter')?.value || '',
      deliveryMethod: document.getElementById('ordersDeliveryFilter')?.value || '',
      manager: document.getElementById('ordersManagerFilter')?.value || '',
      dateFrom: document.getElementById('ordersDateFrom')?.value || '',
      dateTo: document.getElementById('ordersDateTo')?.value || ''
    };
    Object.keys(next).forEach((key) => {
      if (!next[key]) delete next[key];
    });
    const currentSerialized = JSON.stringify(this.ordersFilters || {});
    const nextSerialized = JSON.stringify(next);
    if (currentSerialized === nextSerialized) return;
    this.ordersFilters = next;
    this.loadOrdersPage();
  }

  resetOrdersFilters() {
    const ids = [
      'ordersSearchInput',
      'ordersStatusFilter',
      'ordersPaymentStatusFilter',
      'ordersPaymentFilter',
      'ordersDeliveryFilter',
      'ordersManagerFilter',
      'ordersDateFrom',
      'ordersDateTo'
    ];
    const hadInputValues = ids.some((id) => {
      const el = document.getElementById(id);
      return Boolean(el && el.value);
    });
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (!hadInputValues && !Object.keys(this.ordersFilters || {}).length) return;
    this.ordersFilters = {};
    this.loadOrdersPage();
  }

  async renderSettingsPage() {
    await this.loadTaxonomyDictionaries();
    await this.loadAttributeMeta();
    await this.loadCategoryAttributeTemplates();
  }

  async loadAttributeMeta() {
    try {
      const [attrsRes, templatesRes] = await Promise.all([
        this.fetchJson('/api/admin/attributes'),
        this.fetchJson('/api/admin/category-attribute-templates')
      ]);
      this.attributeDefinitions = Array.isArray(attrsRes?.attributes) ? attrsRes.attributes : [];
      this.categoryAttributeTemplates = Array.isArray(templatesRes?.templates) ? templatesRes.templates : [];
    } catch (error) {
      console.error('Attribute meta load error:', error);
      this.attributeDefinitions = [];
      this.categoryAttributeTemplates = [];
    }
  }

  async loadCategoryAttributeTemplates() {
    try {
      const categorySelect = document.getElementById('templateCategoryName');
      if (categorySelect) {
        const selected = String(categorySelect.value || '');
        categorySelect.innerHTML = '<option value="">Выберите категорию</option>';
        const categories = Array.isArray(this.catalogTaxonomy.functionalCategories)
          ? [...new Set(this.catalogTaxonomy.functionalCategories.map((c) => String(c.name || '').trim()).filter(Boolean))]
          : [];
        categories.sort((a, b) => a.localeCompare(b, 'ru'));
        categories.forEach((name) => {
          const opt = new Option(name, name);
          opt.selected = selected === name;
          categorySelect.add(opt);
        });
      }

      const data = await this.fetchJson('/api/admin/category-attribute-templates');
      const rows = Array.isArray(data.templates) ? data.templates : [];
      const tbody = document.getElementById('categoryAttributeTemplatesBody');
      if (!tbody) return;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">Шаблонов пока нет</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((r) => `
        <tr>
          <td>${this.escapeHtml(r.categoryName || '')}</td>
          <td>${this.escapeHtml(r.attributeCode || '')}</td>
          <td>${this.escapeHtml(r.attributeName || r.attributeCode || '')}</td>
          <td>
            <label class="checkbox">
              <input type="checkbox" data-template-action="toggle-required" data-id="${Number(r.id)}" ${r.required ? 'checked' : ''} />
              <span>${r.required ? 'Да' : 'Нет'}</span>
            </label>
          </td>
          <td>
            <button class="btn btn-outline btn-xs" type="button" data-template-action="delete" data-id="${Number(r.id)}">Удалить</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      this.showError(`Ошибка загрузки шаблонов атрибутов: ${error.message}`);
    }
  }

  async createCategoryAttributeTemplate() {
    const categoryName = String(document.getElementById('templateCategoryName')?.value || '').trim();
    const attributeCode = String(document.getElementById('templateAttributeCode')?.value || '').trim().toLowerCase();
    const attributeName = String(document.getElementById('templateAttributeName')?.value || '').trim();
    const required = !!document.getElementById('templateRequired')?.checked;
    if (!categoryName || !attributeCode || !attributeName) {
      this.showError('Заполните категорию, код и название атрибута');
      return;
    }
    try {
      const attrs = await this.fetchJson('/api/admin/attributes');
      const exists = (attrs.attributes || []).find((a) => String(a.code || '').toLowerCase() === attributeCode);
      if (!exists) {
        await this.fetchJson('/api/admin/attributes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: attributeCode, name: attributeName, type: 'string', status: 'active' })
        });
      }
      await this.fetchJson('/api/admin/category-attribute-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName, attributeCode, required, visible: true, filterable: false, sortOrder: 0 })
      });
      document.getElementById('templateAttributeCode').value = '';
      document.getElementById('templateAttributeName').value = '';
      document.getElementById('templateRequired').checked = true;
      await this.loadAttributeMeta();
      await this.loadCategoryAttributeTemplates();
      this.showSuccess('Шаблон добавлен');
    } catch (error) {
      this.showError(`Ошибка создания шаблона: ${error.message}`);
    }
  }

  async toggleTemplateRequired(templateId, required) {
    try {
      await this.fetchJson(`/api/admin/category-attribute-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ required: !!required })
      });
      await this.loadAttributeMeta();
      await this.loadCategoryAttributeTemplates();
    } catch (error) {
      this.showError(`Ошибка обновления шаблона: ${error.message}`);
    }
  }

  async deleteCategoryAttributeTemplate(templateId) {
    if (!confirm('Удалить шаблон атрибута?')) return;
    try {
      await this.fetchJson(`/api/admin/category-attribute-templates/${templateId}`, { method: 'DELETE' });
      await this.loadAttributeMeta();
      await this.loadCategoryAttributeTemplates();
    } catch (error) {
      this.showError(`Ошибка удаления шаблона: ${error.message}`);
    }
  }

  getAttributeDefinitionByCode(code) {
    const key = String(code || '').trim().toLowerCase();
    return (this.attributeDefinitions || []).find((a) => String(a.code || '').trim().toLowerCase() === key) || null;
  }

  normalizeAttributeEntries(raw) {
    const parsed = this.parseJsonField(raw, []);
    const arr = Array.isArray(parsed) ? parsed : [];
    const out = [];
    arr.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const code = String(item.code || item.key || item.name || '').trim().toLowerCase();
      if (!code) return;
      out.push({
        code,
        name: String(item.name || item.label || code).trim(),
        value: String(item.value ?? '').trim()
      });
    });
    return out;
  }

  getAttributeTemplatesForSelectedCategories() {
    const categories = this.getSelectedFunctionalCategories();
    const primary = String(document.getElementById('productCategory')?.value || '').trim();
    if (primary && !categories.includes(primary)) categories.push(primary);
    const normalized = new Set(categories.map((x) => this.normalizeText(x)));
    const rows = (this.categoryAttributeTemplates || []).filter((t) => normalized.has(this.normalizeText(t.categoryName || '')));
    const byCode = new Map();
    rows.forEach((row) => {
      const code = String(row.attributeCode || '').trim().toLowerCase();
      if (!code) return;
      const prev = byCode.get(code);
      if (!prev) byCode.set(code, { ...row });
      else byCode.set(code, { ...prev, required: Boolean(prev.required || row.required) });
    });
    return [...byCode.values()].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }

  renderProductAttributeEditor() {
    const holder = document.getElementById('productAttributesEditor');
    if (!holder) return;
    const raw = document.getElementById('productAttributesJson')?.value || '[]';
    const existing = this.normalizeAttributeEntries(raw);
    const existingMap = new Map(existing.map((x) => [x.code, x]));
    const templates = this.getAttributeTemplatesForSelectedCategories();
    const rows = [];

    templates.forEach((tpl) => {
      const code = String(tpl.attributeCode || '').trim().toLowerCase();
      const def = this.getAttributeDefinitionByCode(code);
      const current = existingMap.get(code);
      rows.push({
        code,
        name: String(def?.name || tpl.attributeName || current?.name || code),
        type: String(def?.type || tpl.attributeType || 'string').toLowerCase(),
        optionsJson: def?.optionsJson || '[]',
        required: Boolean(tpl.required),
        value: String(current?.value || '')
      });
      existingMap.delete(code);
    });

    for (const extra of existingMap.values()) {
      rows.push({
        code: extra.code,
        name: extra.name || extra.code,
        type: 'string',
        optionsJson: '[]',
        required: false,
        value: String(extra.value || '')
      });
    }

    if (!rows.length) {
      holder.innerHTML = '<div style="color:#6b7280;">Для выбранных категорий шаблоны атрибутов не заданы.</div>';
      return;
    }

    const renderInput = (row) => {
      if (row.type === 'boolean' || row.type === 'bool') {
        return `<select class="select attr-input" data-code="${this.escapeHtml(row.code)}"><option value="" ${row.value === '' ? 'selected' : ''}>—</option><option value="true" ${row.value === 'true' ? 'selected' : ''}>Да</option><option value="false" ${row.value === 'false' ? 'selected' : ''}>Нет</option></select>`;
      }
      if (row.type === 'list') {
        let opts = [];
        try { const p = JSON.parse(String(row.optionsJson || '[]')); opts = Array.isArray(p) ? p : []; } catch { opts = []; }
        const optionsHtml = opts.map((o) => {
          const v = String(o || '').trim();
          return `<option value="${this.escapeHtml(v)}" ${v === row.value ? 'selected' : ''}>${this.escapeHtml(v)}</option>`;
        }).join('');
        return `<select class="select attr-input" data-code="${this.escapeHtml(row.code)}"><option value="">—</option>${optionsHtml}</select>`;
      }
      const type = row.type === 'number' ? 'number' : 'text';
      return `<input class="input attr-input" data-code="${this.escapeHtml(row.code)}" type="${type}" value="${this.escapeHtml(row.value)}" />`;
    };

    holder.innerHTML = `
      <table class="products-table">
        <thead><tr><th>Код</th><th>Название</th><th>Значение</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${this.escapeHtml(row.code)} ${row.required ? '<span style="color:#dc2626;">*</span>' : ''}</td>
              <td>${this.escapeHtml(row.name)}</td>
              <td>${renderInput(row)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    holder.querySelectorAll('.attr-input').forEach((input) => {
      input.addEventListener('change', () => this.syncAttributesJsonFromEditor());
      input.addEventListener('input', () => this.syncAttributesJsonFromEditor());
    });
  }

  syncAttributesJsonFromEditor() {
    const holder = document.getElementById('productAttributesEditor');
    const rawEl = document.getElementById('productAttributesJson');
    if (!holder || !rawEl) return;
    const entries = [];
    holder.querySelectorAll('.attr-input').forEach((el) => {
      const code = String(el.dataset.code || '').trim().toLowerCase();
      if (!code) return;
      const def = this.getAttributeDefinitionByCode(code);
      const value = String(el.value ?? '').trim();
      if (!value) return;
      entries.push({
        code,
        name: String(def?.name || code),
        value
      });
    });
    rawEl.value = JSON.stringify(entries, null, 2);
  }

  refreshAttributeEditor() {
    this.renderProductAttributeEditor();
  }

  syncAttributesFromRaw() {
    this.renderProductAttributeEditor();
  }

  async viewOrderDetails(orderId, focus = 'details') {
    try {
      const data = await this.fetchJson(`/api/admin/orders/${encodeURIComponent(orderId)}`);
      const order = data?.order || null;
      if (!order) throw new Error('Заказ не найден');
      this.currentOrder = order;
      this.renderOrderModal(order);
      this.openModal('orderModal');
      if (String(focus) === 'status') {
        setTimeout(() => {
          const statusEl = document.getElementById('orderModalStatus');
          if (statusEl) statusEl.focus();
        }, 0);
      }
    } catch (error) {
      this.showError(`Ошибка загрузки заказа: ${error.message}`);
    }
  }

  async updateOrderStatus(orderId) {
    return this.viewOrderDetails(orderId, 'status');
  }

  openModal(modalId) {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById(modalId);
    if (!overlay || !modal) return;
    overlay.style.display = 'flex';
    ['bulkModal', 'orderModal'].forEach((id) => {
      const m = document.getElementById(id);
      if (m) m.style.display = id === modalId ? 'block' : 'none';
    });
  }

  renderOrderModal(order) {
    const titleEl = document.getElementById('orderModalTitle');
    const bodyEl = document.getElementById('orderModalBody');
    if (titleEl) titleEl.textContent = `Заказ ${order.id || ''}`;
    if (!bodyEl) return;

    const items = Array.isArray(order.items) ? order.items : [];
    const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    const orderDocuments = Array.isArray(order.orderDocuments) ? order.orderDocuments : [];
    const rows = items.length
      ? items.map((it) => `
        <tr>
          <td>${this.escapeHtml(it.name || '')}</td>
          <td>${this.escapeHtml(it.article || '-')}</td>
          <td>${Number(it.qty || 1)}</td>
          <td>${this.formatPrice(it.price)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="4">Нет позиций</td></tr>';

    bodyEl.innerHTML = `
      <div class="order-modal-grid">
        <section class="order-modal-section">
          <h4>Клиент</h4>
          <div><strong>Имя:</strong> ${this.escapeHtml(order.customerName || '-')}</div>
          <div><strong>Телефон:</strong> ${this.escapeHtml(order.customerPhone || '-')}</div>
          <div><strong>Email:</strong> ${this.escapeHtml(order.customerEmail || '-')}</div>
          <div><strong>Адрес:</strong> ${this.escapeHtml(order.customerAddress || '-')}</div>
          <div><strong>Дата:</strong> ${this.escapeHtml(this.formatDateTime(order.createdAt))}</div>
          <div><strong>Сумма:</strong> ${this.escapeHtml(this.formatPrice(order.total))}</div>
        </section>
        <section class="order-modal-section">
          <h4>Управление</h4>
          <div class="form-grid">
            <div class="form-group">
              <label>Статус заказа</label>
              <select id="orderModalStatus" class="select">
                ${['new', 'in_work', 'paid', 'shipped', 'completed', 'cancelled']
                  .map((s) => `<option value="${s}" ${String(order.status || '') === s ? 'selected' : ''}>${this.escapeHtml(this.getOrderStatusMeta(s).text)}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Статус оплаты</label>
              <select id="orderModalPaymentStatus" class="select">
                ${['unpaid', 'paid', 'partial', 'refund']
                  .map((s) => `<option value="${s}" ${String(order.paymentStatus || '') === s ? 'selected' : ''}>${this.escapeHtml(this.getPaymentStatusMeta(s).text)}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Способ оплаты</label>
              <input id="orderModalPaymentMethod" class="input" type="text" value="${this.escapeHtml(order.paymentMethod || '')}" />
            </div>
            <div class="form-group">
              <label>Способ доставки</label>
              <input id="orderModalDeliveryMethod" class="input" type="text" value="${this.escapeHtml(order.deliveryMethod || '')}" />
            </div>
            <div class="form-group">
              <label>Менеджер</label>
              <input id="orderModalManager" class="input" type="text" value="${this.escapeHtml(order.manager || '')}" />
            </div>
            <div class="form-group full-width">
              <label>Комментарий менеджера</label>
              <textarea id="orderModalManagerComment" class="textarea" rows="3">${this.escapeHtml(order.managerComment || '')}</textarea>
            </div>
          </div>
        </section>
      </div>
      <section class="order-modal-section" style="margin-top:12px;">
        <h4>Состав заказа</h4>
        <table class="order-lines">
          <thead><tr><th>Товар</th><th>Артикул</th><th>Кол-во</th><th>Цена</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      <section class="order-modal-section" style="margin-top:12px;">
        <h4>История статусов</h4>
        <div>${history.length ? history.slice().reverse().map((h)=>`<div>${this.escapeHtml(this.formatDateTime(h.at))}: ${this.formatOrderStatusBadge(h.status)} ${this.formatPaymentStatusBadge(h.paymentStatus)} (${this.escapeHtml(h.by || 'admin')})</div>`).join('') : 'Нет истории'}</div>
      </section>
      <section class="order-modal-section" style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <h4 style="margin:0;">Файлы/документы заказа</h4>
          <button type="button" class="btn btn-outline btn-xs" data-order-doc-action="add">Добавить файл</button>
        </div>
        <table class="order-lines" style="margin-top:8px;">
          <thead><tr><th>Тип</th><th>Название</th><th>URL</th><th></th></tr></thead>
          <tbody id="orderModalDocumentsBody"></tbody>
        </table>
      </section>
    `;
    this.renderOrderDocumentsRows(orderDocuments);
  }

  renderOrderDocumentsRows(documents = []) {
    const body = document.getElementById('orderModalDocumentsBody');
    if (!body) return;
    const rows = Array.isArray(documents) ? documents : [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4" style="padding:8px 4px;color:#6b7280;">Файлы не добавлены</td></tr>';
      return;
    }
    const typeOptions = [
      ['confirmation', 'Подтверждение заказа'],
      ['invoice', 'Счёт'],
      ['receipt', 'Чек'],
      ['waybill', 'Накладная'],
      ['upd', 'УПД']
    ];
    body.innerHTML = rows.map((doc, index) => `
      <tr>
        <td>
          <select class="select order-doc-type">
            ${typeOptions
              .map(([value, label]) => `<option value="${value}" ${String(doc.type || 'confirmation') === value ? 'selected' : ''}>${label}</option>`)
              .join('')}
          </select>
        </td>
        <td><input class="input order-doc-title" type="text" value="${this.escapeHtml(doc.title || '')}" placeholder="Название документа" /></td>
        <td><input class="input order-doc-url" type="text" value="${this.escapeHtml(doc.url || '')}" placeholder="https://..." /></td>
        <td style="text-align:right;"><button type="button" class="btn btn-danger btn-xs" data-order-doc-action="remove" data-index="${index}">Удалить</button></td>
      </tr>
    `).join('');
  }
  addOrderModalDocumentRow() {
    const docs = this.collectOrderDocumentsFromModal();
    docs.push({ type: 'confirmation', title: '', url: '' });
    this.renderOrderDocumentsRows(docs);
  }

  removeOrderModalDocumentRow(index) {
    const docs = this.collectOrderDocumentsFromModal();
    const idx = Number(index);
    if (Number.isFinite(idx) && idx >= 0 && idx < docs.length) docs.splice(idx, 1);
    this.renderOrderDocumentsRows(docs);
  }

  collectOrderDocumentsFromModal() {
    const body = document.getElementById('orderModalDocumentsBody');
    if (!body) return [];
    const rows = [...body.querySelectorAll('tr')];
    return rows
      .map((row) => {
        const type = String(row.querySelector('.order-doc-type')?.value || 'confirmation').trim();
        const title = String(row.querySelector('.order-doc-title')?.value || '').trim();
        const url = String(row.querySelector('.order-doc-url')?.value || '').trim();
        return { type, title, url };
      })
      .filter((doc) => doc.url);
  }

  async saveOrderModal() {
    const order = this.currentOrder;
    if (!order?.id) return;
    const payload = {
      status: document.getElementById('orderModalStatus')?.value || '',
      paymentStatus: document.getElementById('orderModalPaymentStatus')?.value || '',
      paymentMethod: document.getElementById('orderModalPaymentMethod')?.value || '',
      deliveryMethod: document.getElementById('orderModalDeliveryMethod')?.value || '',
      manager: document.getElementById('orderModalManager')?.value || '',
      managerComment: document.getElementById('orderModalManagerComment')?.value || '',
      orderDocuments: this.collectOrderDocumentsFromModal()
    };
    try {
      await this.fetchJson(`/api/admin/orders/${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      this.showSuccess('Заказ обновлен');
      this.currentOrder = null;
      window.closeModal('orderModal');
      await this.loadOrdersPage();
    } catch (error) {
      this.showError(`Ошибка обновления заказа: ${error.message}`);
    }
  }

  async loadProducts() {
    try {
      const params = new URLSearchParams({
        limit: this.pagination.limit,
        offset: this.pagination.offset,
        ...this.currentFilters
      });

      const data = await this.fetchJson(`/api/admin/products?${params.toString()}`);
      const nextPagination = data.pagination || {
        offset: this.pagination.offset,
        limit: this.pagination.limit,
        total: data.total || 0,
        hasMore: this.pagination.offset + this.pagination.limit < (data.total || 0)
      };
      const safeLimit = Math.max(1, Number(nextPagination.limit || this.pagination.limit || 50));
      const safeTotal = Math.max(0, Number(nextPagination.total || 0));
      const maxOffset = safeTotal > 0 ? Math.max(0, (Math.ceil(safeTotal / safeLimit) - 1) * safeLimit) : 0;
      if (Number(nextPagination.offset || 0) > maxOffset) {
        if (Number(this.pagination.offset || 0) === maxOffset) {
          this.updatePagination({ ...nextPagination, offset: maxOffset });
          this.renderProductsTable(data.products || data.rows || []);
          this.updateTableInfo(this.pagination);
          return;
        }
        this.pagination.offset = maxOffset;
        await this.loadProducts();
        return;
      }

      this.renderProductsTable(data.products || data.rows || []);
      this.updatePagination(nextPagination);
      this.updateProductsBadge(this.pagination.total);
      this.updateTableInfo(this.pagination);
    } catch (error) {
      console.error('Error loading products:', error);
      this.updateProductsBadge(null);
      this.showError(`Ошибка при загрузке товаров: ${error.message}`);
    }
  }

  updateProductsBadge(total) {
    const el = document.getElementById('productsCount');
    if (!el) return;
    const n = Number(total);
    if (Number.isFinite(n) && n >= 0) {
      el.textContent = `${n} товаров`;
      return;
    }
    el.textContent = 'Товары';
  }

  renderProductsTable(products) {
    this.loadedProducts = Array.isArray(products) ? products : [];
    this.renderProductsView();
  }

  renderProductsView() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    this.applySortHeaderState();
    this.updateHeaderFilterBadges();

    const view = this.getVisibleProductsView();
    this.filteredRowsCount = view.length;

    if (!view.length) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;">Товары не найдены</td></tr>';
      this.updateTableInfo(this.pagination);
      return;
    }

    view.forEach((product) => {
      const tr = document.createElement('tr');
      const status = this.getStatusBadge(product);
      const statusCode = this.getStatusCode(product);
      const groupValue = product.group || product.groupName || '-';
      const variantsCount = Number(product.variants || 0);
      const hasVariantConflict = this.hasVariantConflict(product);
      const safeName = this.escapeHtml(String(product.name || ''));
      const photoActionLabel = `Открыть фото товара «${safeName}»`;
      const visibilityLabel = statusCode === 'active' ? 'Скрыть' : 'Опубликовать';
      const visibilityIcon = statusCode === 'active' ? 'visibility_off' : 'visibility';

      tr.innerHTML = `
        <td>
          <input type="checkbox" class="product-checkbox" data-id="${product.id}">
        </td>
        <td>
          <button
            type="button"
            class="product-photo-trigger"
            data-product-action="photos"
            data-id="${product.id}"
            aria-label="${photoActionLabel}"
            title="${photoActionLabel}"
          >
            ${product.image
              ? `<img src="${this.escapeHtml(product.image)}" alt="${safeName}" class="product-photo">`
              : '<div class="product-photo product-photo-placeholder"><span class="material-symbols-rounded msi" aria-hidden="true">image</span></div>'}
          </button>
        </td>
        <td>
          <div class="product-name">
            <strong>${this.escapeHtml(product.name || '-')}</strong>
            ${product.is_extra ? '<div class="extra-indicator">Доп. импорт (Extra)</div>' : ''}
            ${Number(product.isConflict || 0) ? `<div class="conflict-indicator" title="${this.escapeHtml(String(product.conflictNote || 'Data conflict'))}">Конфликт данных</div>` : ''}
          </div>
        </td>
        <td>${this.escapeHtml(product.article || '-')}</td>
        <td>${this.escapeHtml(product.brand || '-')}</td>
        <td>
          <div>${this.escapeHtml(product.category || '-')}</div>
          <small style="color:#6b7280">${this.escapeHtml(groupValue)}</small>
        </td>
        <td>
          <span class="status-badge ${status.css}">${this.escapeHtml(status.text)}</span>
          ${hasVariantConflict ? '<br><small style="color:#b45309">No active variants</small>' : ''}
        </td>
        <td>
          <strong>${this.formatPrice(product.price)}</strong>
          ${variantsCount > 0 ? `<br><small>${variantsCount} вариантов</small>` : ''}
        </td>
        <td style="text-align:center;">${Number(product.documentsCount || 0)}</td>
        <td><small style="color:#6b7280;">${this.formatDate(product.updatedAt)}</small></td>
        <td>
          <div class="action-buttons">
            <button
              type="button"
              class="btn-action btn-action-icon"
              data-product-action="edit"
              data-id="${product.id}"
              aria-label="Редактировать"
              title="Редактировать"
            ><span class="material-symbols-rounded msi" aria-hidden="true">edit</span></button>
            <button
              type="button"
              class="btn-action btn-action-icon"
              data-product-action="photos"
              data-id="${product.id}"
              aria-label="Фото"
              title="Фото"
            ><span class="material-symbols-rounded msi" aria-hidden="true">imagesmode</span></button>
            <button
              type="button"
              class="btn-action btn-action-icon"
              data-product-action="toggle-visibility"
              data-id="${product.id}"
              data-status="${statusCode}"
              data-name="${safeName}"
              aria-label="${visibilityLabel}"
              title="${visibilityLabel}"
            ><span class="material-symbols-rounded msi" aria-hidden="true">${visibilityIcon}</span></button>
            <button
              type="button"
              class="btn-action btn-action-icon"
              data-product-action="view"
              data-id="${product.id}"
              aria-label="Открыть"
              title="Открыть"
            ><span class="material-symbols-rounded msi" aria-hidden="true">visibility</span></button>
            <button
              type="button"
              class="btn-action btn-action-icon btn-action-danger"
              data-product-action="delete"
              data-id="${product.id}"
              data-name="${this.escapeHtml(String(product.name || ''))}"
              aria-label="Удалить"
              title="Удалить"
            ><span class="material-symbols-rounded msi" aria-hidden="true">delete</span></button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    this.updateTableInfo(this.pagination);
  }

  getVisibleProductsView() {
    let view = [...this.loadedProducts];
    view = view.filter((product) => this.matchesColumnFilters(product));
    view.sort((a, b) => this.compareProducts(a, b));
    return view;
  }

  normalizeText(value) {
    return this.displayText(value).toLowerCase().trim();
  }

  getSelectedFunctionalCategories() {
    const category = String(document.getElementById('productCategory')?.value || '').trim();
    return category ? [category] : [];
  }

  getSelectedBrandCategories() {
    const primary = Number(document.getElementById('productPrimaryBrandCategory')?.value || 0);
    if (Number.isFinite(primary) && primary > 0) return [primary];
    const select = document.getElementById('productBrandCategories');
    if (!select) return [];
    return Array.from(select.selectedOptions)
      .map((opt) => Number(opt.value))
      .filter((v) => Number.isFinite(v) && v > 0);
  }

  setSelectedFunctionalCategories(values) {
    const productCategory = document.getElementById('productCategory');
    const list = (Array.isArray(values) ? values : []).map((x) => String(x || '').trim()).filter(Boolean);
    if (productCategory && list.length) productCategory.value = list[0];
  }

  getStatusCode(product) {
    if (product.is_extra) return 'extra';
    const raw = String(product.status || 'active').toLowerCase();
    if (raw === 'draft') return 'draft';
    if (raw === 'hidden') return 'hidden';
    if (raw === 'archived') return 'archived';
    return 'active';
  }

  matchesColumnFilters(product) {
    const f = this.columnFilters;
    if (f.brand && this.normalizeText(product.brand) !== this.normalizeText(f.brand)) return false;
    if (f.category) {
      const productCategory = this.normalizeText(product.category);
      const productGroup = this.normalizeText(product.group || product.groupName || '');
      const selected = this.normalizeText(f.category);
      if (productCategory !== selected && productGroup !== selected) return false;
    }
    if (f.status && this.getStatusCode(product) !== f.status) return false;
    const docsCount = Number(product.documentsCount || 0);
    if (f.docs === 'with' && docsCount <= 0) return false;
    if (f.docs === 'without' && docsCount > 0) return false;
    return true;
  }

  updateHeaderFilterBadges() {
    const map = [
      ['hfBrandBadge', 'brand'],
      ['hfCategoryBadge', 'category'],
      ['hfStatusBadge', 'status'],
      ['hfDocsBadge', 'docs'],
      ['hfPriceBadge', 'price']
    ];
    map.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (key === 'price') {
        const min = String(this.columnFilters.priceMin || '').trim();
        const max = String(this.columnFilters.priceMax || '').trim();
        if (!min && !max) {
          el.textContent = '';
          return;
        }
        if (min && max) el.textContent = `${min}-${max}`;
        else if (min) el.textContent = `от ${min}`;
        else el.textContent = `до ${max}`;
        return;
      }
      const value = this.columnFilters[key];
      if (!value) {
        el.textContent = '';
        return;
      }
      if (key === 'status') {
        const labels = { active: 'Опубликован', draft: 'Черновик', hidden: 'Скрыт', archived: 'Архив', extra: 'Лишний' };
        el.textContent = labels[value] || value;
        return;
      }
      if (key === 'docs') {
        const labels = { with: 'Есть', without: 'Нет' };
        el.textContent = labels[value] || value;
        return;
      }
      el.textContent = value;
    });
  }

  getHeaderFilterOptions(key) {
    if (key === 'brand') {
      return [...new Set((this.availableFilters.brands || []).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map((v) => ({ value: v, label: v }));
    }
    if (key === 'category') {
      return [...new Set((this.availableFilters.categories || []).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map((v) => ({ value: v, label: v }));
    }
    if (key === 'status') {
      return [
        { value: 'active', label: 'Опубликован' },
        { value: 'draft', label: 'Черновик' },
        { value: 'hidden', label: 'Скрыт' },
        { value: 'archived', label: 'Архив' },
        { value: 'extra', label: 'Лишний' }
      ];
    }
    if (key === 'docs') {
      return [
        { value: 'with', label: 'Есть документы' },
        { value: 'without', label: 'Без документов' }
      ];
    }
    return [];
  }

  openHeaderFilter(key, event) {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    const anchor = event?.currentTarget;
    if (!anchor) return;

    if (this.headerFilter.open && this.headerFilter.key === key) {
      this.closeHeaderFilter();
      return;
    }

    const tempValue = key === 'price'
      ? { min: String(this.columnFilters.priceMin || ''), max: String(this.columnFilters.priceMax || '') }
      : (this.columnFilters[key] || '');
    this.headerFilter = { open: true, key, tempValue, anchor };
    this.renderHeaderFilterPopover();
  }

  closeHeaderFilter() {
    const popover = document.getElementById('tableHeaderFilterPopover');
    if (popover) {
      popover.classList.add('hidden');
      popover.innerHTML = '';
    }
    this.headerFilter = { open: false, key: '', tempValue: '', anchor: null };
  }

  renderHeaderFilterPopover() {
    const popover = document.getElementById('tableHeaderFilterPopover');
    const { key, tempValue, anchor } = this.headerFilter;
    if (!popover || !key || !anchor) return;

    const options = this.getHeaderFilterOptions(key);
    const titles = { brand: 'Бренд', category: 'Категория', status: 'Статус', docs: 'Док-ты', price: 'Цена' };
    popover.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'table-filter-popover-title';
    title.textContent = titles[key] || 'Фильтр';
    popover.appendChild(title);

    if (key === 'price') {
      const rangeWrap = document.createElement('div');
      rangeWrap.className = 'table-filter-popover-range';
      const startValue = tempValue && typeof tempValue === 'object' ? String(tempValue.min || '') : '';
      const endValue = tempValue && typeof tempValue === 'object' ? String(tempValue.max || '') : '';
      rangeWrap.innerHTML = `
        <input type="number" min="0" step="0.01" class="input table-filter-input" id="hfPriceMin" placeholder="Цена от" value="${startValue.replace(/"/g, '&quot;')}" />
        <input type="number" min="0" step="0.01" class="input table-filter-input" id="hfPriceMax" placeholder="Цена до" value="${endValue.replace(/"/g, '&quot;')}" />
      `;
      rangeWrap.querySelector('#hfPriceMin')?.addEventListener('input', (e) => {
        const min = String(e?.target?.value || '').trim();
        const prev = this.headerFilter.tempValue && typeof this.headerFilter.tempValue === 'object'
          ? this.headerFilter.tempValue
          : { min: '', max: '' };
        this.headerFilter.tempValue = { ...prev, min };
      });
      rangeWrap.querySelector('#hfPriceMax')?.addEventListener('input', (e) => {
        const max = String(e?.target?.value || '').trim();
        const prev = this.headerFilter.tempValue && typeof this.headerFilter.tempValue === 'object'
          ? this.headerFilter.tempValue
          : { min: '', max: '' };
        this.headerFilter.tempValue = { ...prev, max };
      });
      popover.appendChild(rangeWrap);
    } else {
      const list = document.createElement('div');
      list.className = 'table-filter-popover-list';
      const radioName = `hf-${key}`;

      const allOption = document.createElement('label');
      allOption.className = 'table-filter-radio';
      allOption.innerHTML = `
        <input type="radio" name="${radioName}" value="" ${tempValue === '' ? 'checked' : ''} />
        <span>Все</span>
      `;
      allOption.querySelector('input')?.addEventListener('change', () => {
        this.headerFilter.tempValue = '';
      });
      list.appendChild(allOption);

      options.forEach((opt) => {
        const item = document.createElement('label');
        item.className = 'table-filter-radio';
        item.innerHTML = `
          <input type="radio" name="${radioName}" value="${String(opt.value).replace(/"/g, '&quot;')}" ${tempValue === opt.value ? 'checked' : ''} />
          <span>${opt.label}</span>
        `;
        item.querySelector('input')?.addEventListener('change', () => {
          this.headerFilter.tempValue = opt.value;
        });
        list.appendChild(item);
      });
      popover.appendChild(list);
    }

    const footer = document.createElement('div');
    footer.className = 'table-filter-popover-footer';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-outline btn-xs';
    resetBtn.textContent = 'Сброс';
    resetBtn.addEventListener('click', () => {
      if (key === 'price') {
        this.headerFilter.tempValue = { min: '', max: '' };
        this.columnFilters.priceMin = '';
        this.columnFilters.priceMax = '';
      } else {
        this.headerFilter.tempValue = '';
        this.columnFilters[key] = '';
      }
      this.closeHeaderFilter();
      this.applyFilters();
    });
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-primary btn-xs';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => {
      if (key === 'price') {
        const value = this.headerFilter.tempValue && typeof this.headerFilter.tempValue === 'object'
          ? this.headerFilter.tempValue
          : { min: '', max: '' };
        this.columnFilters.priceMin = String(value.min || '').trim();
        this.columnFilters.priceMax = String(value.max || '').trim();
      } else {
        this.columnFilters[key] = this.headerFilter.tempValue || '';
      }
      this.closeHeaderFilter();
      this.applyFilters();
    });
    footer.appendChild(resetBtn);
    footer.appendChild(okBtn);
    popover.appendChild(footer);

    const rect = anchor.getBoundingClientRect();
    popover.classList.remove('hidden');
    popover.style.left = `${Math.max(10, rect.left)}px`;
    popover.style.top = `${rect.bottom + 6}px`;
  }

  setTableSort(key) {
    if (!key) return;
    if (this.tableSort.key === key) {
      this.tableSort.dir = this.tableSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      this.tableSort.key = key;
      this.tableSort.dir = key === 'updatedAt' ? 'desc' : 'asc';
    }
    // Sorting always starts from the first page for predictable navigation.
    if (Number(this.pagination.offset || 0) > 0) {
      this.pagination.offset = 0;
      this.loadProducts();
      return;
    }
    this.renderProductsView();
  }

  applySortHeaderState() {
    document.querySelectorAll('.products-table th.sortable').forEach((th) => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sortKey === this.tableSort.key) {
        th.classList.add(this.tableSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  compareProducts(a, b) {
    const key = this.tableSort.key;
    const dir = this.tableSort.dir === 'asc' ? 1 : -1;

    const pick = (item) => {
      if (key === 'status') return this.getStatusCode(item);
      if (key === 'documentsCount') return Number(item.documentsCount || 0);
      if (key === 'price') return Number(item.price || 0);
      if (key === 'updatedAt') return new Date(item.updatedAt || 0).getTime();
      return this.normalizeText(item[key]);
    };

    const av = pick(a);
    const bv = pick(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  }

  getStatusBadge(product) {
    if (product.is_extra) return { css: 'warning', text: 'Доп. импорт' };
    const raw = String(product.status || 'active').toLowerCase();
    if (raw === 'draft') return { css: 'draft', text: 'Черновик' };
    if (raw === 'hidden') return { css: 'hidden', text: 'Скрыт' };
    if (raw === 'archived') return { css: 'hidden', text: 'Архив' };
    return { css: 'active', text: 'Опубликован' };
  }

  getVariantSummaryForProduct(product, variants = null) {
    if (Array.isArray(variants)) {
      const total = variants.length;
      const active = variants.filter((v) => String(v?.status || '').toLowerCase() === 'active').length;
      return { total, active };
    }
    const total = Number(product?.variantsCount ?? product?.variants ?? 0);
    const active = Number(product?.activeVariants ?? 0);
    return { total, active };
  }

  hasVariantConflict(product, variants = null) {
    const status = String(product?.status || 'active').toLowerCase();
    if (status !== 'active') return false;
    const summary = this.getVariantSummaryForProduct(product, variants);
    return summary.total > 0 && summary.active <= 0;
  }

  applyFilters() {
    const headerBrand = this.columnFilters.brand || '';
    const headerCategory = this.columnFilters.category || '';
    const headerStatus = this.columnFilters.status || '';
    const headerDocs = this.columnFilters.docs || '';
    const headerPriceMin = String(this.columnFilters.priceMin || '').trim();
    const headerPriceMax = String(this.columnFilters.priceMax || '').trim();

    let statusValue = headerStatus || '';
    let isExtraValue = '';
    if (headerStatus === 'extra') {
      statusValue = '';
      isExtraValue = '1';
    }

    const combinedTypeValue = String(document.getElementById('variantConflictFilter')?.value || '');
    let variantConflictValue = '';
    let hasVariantsValue = '';
    let hasPhotosValue = '';
    let hasDocsValue = '';
    if (combinedTypeValue === 'var_1') variantConflictValue = '1';
    if (combinedTypeValue === 'var_0') variantConflictValue = '0';
    if (combinedTypeValue === 'hv_1') hasVariantsValue = '1';
    if (combinedTypeValue === 'hv_0') hasVariantsValue = '0';
    if (combinedTypeValue === 'extra_1') isExtraValue = '1';
    if (combinedTypeValue === 'extra_0') isExtraValue = '0';
    if (combinedTypeValue === 'ph_1') hasPhotosValue = '1';
    if (combinedTypeValue === 'ph_0') hasPhotosValue = '0';
    if (combinedTypeValue === 'docs_1') hasDocsValue = '1';
    if (combinedTypeValue === 'docs_0') hasDocsValue = '0';
    if (headerDocs === 'with') hasDocsValue = '1';
    if (headerDocs === 'without') hasDocsValue = '0';

    const selectedBrandCategoryValue = String(document.getElementById('brandCategoryFilter')?.value || '').trim();
    const hasNumericBrandCategoryId = /^\d+$/.test(selectedBrandCategoryValue);
    const selectedGroupValue = String(document.getElementById('groupFilter')?.value || '').trim();
    const legacyGroupFallback = (!hasNumericBrandCategoryId && selectedBrandCategoryValue && !selectedGroupValue)
      ? selectedBrandCategoryValue
      : '';

    const next = {
      q: document.getElementById('searchInput')?.value || '',
      brand: headerBrand || document.getElementById('brandFilter')?.value || '',
      category: headerCategory || document.getElementById('categoryFilter')?.value || '',
      brandCategoryId: hasNumericBrandCategoryId ? selectedBrandCategoryValue : '',
      brandSubcategory: hasNumericBrandCategoryId ? '' : selectedBrandCategoryValue,
      group: selectedGroupValue || legacyGroupFallback,
      status: statusValue,
      hasDocs: hasDocsValue,
      hasVariants: hasVariantsValue,
      hasPhotos: hasPhotosValue,
      minPrice: headerPriceMin,
      maxPrice: headerPriceMax,
      is_extra: isExtraValue,
      variantConflict: variantConflictValue
    };

    Object.keys(next).forEach((key) => {
      if (!next[key]) delete next[key];
    });

    this.currentFilters = next;
    this.pagination.offset = 0;
    this.loadProducts();
  }

  resetFilters() {
    [
      'searchInput',
      'brandFilter',
      'categoryTreeFilter',
      'categoryFilter',
      'brandCategoryFilter',
      'groupFilter',
      'variantConflictFilter'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    this.currentFilters = {};
    this.syncGroupFilterOptions();
    this.syncBrandCategoryFilterOptions();
    this.columnFilters = {
      brand: '',
      category: '',
      status: '',
      docs: '',
      priceMin: '',
      priceMax: ''
    };
    this.closeHeaderFilter();
    this.pagination.offset = 0;
    this.loadProducts();
  }

  toggleProductSelection(productId) {
    if (this.selectedProducts.has(productId)) this.selectedProducts.delete(productId);
    else this.selectedProducts.add(productId);
    this.updateBulkActions();
  }

  toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const checked = !!selectAll?.checked;

    document.querySelectorAll('.product-checkbox').forEach((checkbox) => {
      checkbox.checked = checked;
      if (checked) this.selectedProducts.add(checkbox.dataset.id);
      else this.selectedProducts.delete(checkbox.dataset.id);
    });

    this.updateBulkActions();
  }

  updateBulkActions() {
    const bulkActions = document.getElementById('bulkActions');
    const selectedCount = document.getElementById('selectedCount');
    if (!bulkActions || !selectedCount) return;

    if (this.selectedProducts.size > 0) {
      bulkActions.style.display = 'flex';
      selectedCount.textContent = String(this.selectedProducts.size);
    } else {
      bulkActions.style.display = 'none';
    }
  }

  clearSelection() {
    this.selectedProducts.clear();
    const selectAll = document.getElementById('selectAll');
    if (selectAll) selectAll.checked = false;
    document.querySelectorAll('.product-checkbox').forEach((cb) => {
      cb.checked = false;
    });
    this.updateBulkActions();
  }

  async applyBulkAction() {
    const action = document.getElementById('bulkAction')?.value;
    if (!action || this.selectedProducts.size === 0) return;

    if (action === 'delete' && !confirm(`Удалить ${this.selectedProducts.size} товаров?`)) return;

    const data = {};
    if (action === 'assignFunctionalCategory') {
      const category = prompt('Введите функциональную категорию для назначения');
      if (!category) return;
      data.category = category;
    }
    if (action === 'removeFunctionalCategory') {
      const category = prompt('Введите функциональную категорию для снятия');
      if (!category) return;
      data.category = category;
    }
    if (action === 'updateCategory') {
      const group = prompt('Введите новую подкатегорию');
      if (!group) return;
      data.group = group;
    }
    if (action === 'updateBrand') {
      const brand = prompt('Введите новый бренд');
      if (!brand) return;
      data.brand = brand;
    }
    if (action === 'updateStatus') {
      const status = prompt('Введите статус: active | draft | hidden | archived', 'active');
      if (!status) return;
      data.status = status;
    }
    if (action === 'adjustPrice') {
      const mode = prompt('Режим: set | delta | percent', 'percent');
      if (!mode) return;
      const valueRaw = prompt('Значение (например 10 для +10%)', '0');
      if (valueRaw == null) return;
      const value = Number(String(valueRaw).replace(',', '.'));
      if (!Number.isFinite(value)) {
        this.showError('Некорректное число');
        return;
      }
      data.mode = String(mode).trim();
      data.value = value;
    }
    if (action === 'archive') {
      if (!confirm(`Архивировать ${this.selectedProducts.size} товаров?`)) return;
    }

    if (action === 'deactivateVariantConflict') {
      if (!confirm(`Hide variant-conflict products among selected (${this.selectedProducts.size})?`)) return;
    }

    try {
      const result = await this.fetchJson('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, productIds: Array.from(this.selectedProducts), data })
      });

      this.showSuccess(result.message || 'Операция выполнена');
      this.clearSelection();
      this.loadProducts();
    } catch (error) {
      console.error('Bulk action error:', error);
      this.showError(`Ошибка массовой операции: ${error.message}`);
    }
  }

  async editProduct(productId) {
    try {
      const product = await this.fetchJson(`/api/admin/products/${productId}`);
      await this.loadTaxonomyDictionaries();
      await this.loadAttributeMeta();
      this.currentProduct = product;
      this.showProductEditor();
      await this.fillProductForm(product);
      this.setVariants(product.variants || []);
      this.setMedia(product.media || []);
      this.setDocuments(product.documents || []);
      this.renderVariantsTable();
      await this.loadContentTabs();
    } catch (error) {
      console.error('Error loading product:', error);
      this.showError(`Ошибка загрузки товара: ${error.message}`);
    }
  }

  async openProductPhotos(productId) {
    const id = String(productId || '').trim();
    if (!id) return;
    await this.editProduct(id);
    this.switchEditorTab('photos');
  }

  showProductEditor() {
    const productsPage = document.getElementById('productsPage');
    const productEditPage = document.getElementById('productEditPage');
    if (productsPage) productsPage.style.display = 'none';
    if (productEditPage) productEditPage.style.display = 'block';
    this.setActiveNav('products');
  }

  backToProducts() {
    this.currentPage = 'products';
    this.setHash('products', true);
    this.setActiveNav('products');
    this.showMainPage('products');
    this.currentProduct = null;
    this.currentVariants = [];
    this.currentMedia = [];
    this.currentDocuments = [];
    this.currentContentTabs = [];
    this.selectedContentTabId = null;
  }

  async fillProductForm(product) {
    const groupValue = product.group || product.groupName || '';
    const functionalCategories = Array.isArray(product.functionalCategories) ? product.functionalCategories : [];
    const primaryFunctionalCategory = product.primaryFunctionalCategory || product.category || '';

    document.getElementById('productTitle').textContent = `Редактирование: ${product.name || ''}`;
    document.getElementById('productName').value = product.name || '';
    document.getElementById('productArticle').value = product.article || '';
    document.getElementById('productBrand').value = product.brand || '';
    document.getElementById('productCategory').value = primaryFunctionalCategory;
    this.setSelectedFunctionalCategories(functionalCategories.length ? functionalCategories : [primaryFunctionalCategory]);
    this.syncProductFunctionalSubcategories();
    const functionalSubcategories = document.getElementById('productFunctionalCategories');
    if (functionalSubcategories) functionalSubcategories.value = groupValue;
    document.getElementById('productGroup').value = groupValue;
    const primaryBrandCategorySelect = document.getElementById('productPrimaryBrandCategory');
    await this.syncProductBrandCategoryOptions();
    if (primaryBrandCategorySelect) {
      const nextPrimary = product.primaryBrandCategoryId
        ? String(product.primaryBrandCategoryId)
        : (String(product.brandSubcategory || '').trim()
          ? `native::${String(product.brandSubcategory || '').trim()}`
          : String((Array.isArray(product.brandCategoryIds) && product.brandCategoryIds[0]) || ''));
      const exists = Array.from(primaryBrandCategorySelect.options).some((o) => String(o.value) === String(nextPrimary));
      if (!exists && String(nextPrimary).startsWith('native::')) {
        primaryBrandCategorySelect.add(new Option(String(nextPrimary).slice(8), nextPrimary));
      }
      primaryBrandCategorySelect.value = nextPrimary;
    }
    document.getElementById('productPrice').value = product.price ?? '';
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productStatus').value = product.status || 'active';
    const featuredEl = document.getElementById('productBrandFeatured');
    if (featuredEl) featuredEl.checked = Number(product.isBrandFeatured || 0) === 1;
    document.getElementById('productAttributesJson').value = this.prettyJson(product.attributesJson, []);
    document.getElementById('productSlug').value = product.slug || '';
    document.getElementById('productMetaTitle').value = product.metaTitle || '';
    document.getElementById('productMetaDescription').value = product.metaDescription || '';
    this._seoPriceRub = Number(product.priceRub || 0);
    this.renderProductAttributeEditor();
    this.refreshQualityIndicator();
    this.renderProductOverview();
    this.updateSeoPreview();
  }

  // Превью авто-генерируемых метатегов (зеркалит серверный генератор
  // services/meta-tags.js). Цена берётся в рублях из price_rub, как на витрине.
  buildAutoSeo() {
    const SITE = 'Делаем сети';
    const TITLE_MAX = 60;
    const DESC_MAX = 160;
    const strip = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const truncate = (s, max) => {
      const t = strip(s);
      if (t.length <= max) return t;
      const cut = t.slice(0, max - 1);
      const sp = cut.lastIndexOf(' ');
      const base = sp > max * 0.6 ? cut.slice(0, sp) : cut;
      return base.replace(/[\s.,;:!-]+$/, '') + '…';
    };
    const name = String(document.getElementById('productName')?.value || '').trim();
    const descRaw = String(document.getElementById('productDescription')?.value || '').trim();
    const priceRub = Number(this._seoPriceRub || 0);
    const priceText = priceRub > 0 ? `${Math.round(priceRub).toLocaleString('ru-RU')} ₽` : '';

    const autoTitle = truncate(
      priceText ? `${name} — ${priceText} | ${SITE}` : `${name} | ${SITE}`,
      TITLE_MAX
    );
    const priceSuffix = priceText ? ` Цена ${priceText}. Доставка по России.` : ' Доставка по России.';
    const baseDesc = strip(descRaw) || `${name} для умного дома.`;
    const autoDesc = truncate(truncate(baseDesc, DESC_MAX - priceSuffix.length) + priceSuffix, DESC_MAX);
    return { autoTitle, autoDesc };
  }

  updateSeoPreview() {
    const titleEl = document.getElementById('productMetaTitle');
    const descEl = document.getElementById('productMetaDescription');
    if (!titleEl || !descEl) return;

    const tVal = String(titleEl.value || '').trim();
    const dVal = String(descEl.value || '').trim();

    const setCounter = (el, len, max) => {
      if (!el) return;
      el.textContent = `${len}/${max}`;
      el.classList.toggle('seo-counter-over', len > max);
    };
    setCounter(document.getElementById('metaTitleCounter'), tVal.length, 60);
    setCounter(document.getElementById('metaDescCounter'), dVal.length, 160);

    const { autoTitle, autoDesc } = this.buildAutoSeo();
    const tAuto = document.getElementById('metaTitleAuto');
    const dAuto = document.getElementById('metaDescAuto');
    if (tAuto) tAuto.textContent = tVal ? '' : `Авто: «${autoTitle}»`;
    if (dAuto) dAuto.textContent = dVal ? '' : `Авто: «${autoDesc}»`;
  }

  prettyJson(value, fallback) {
    const parsed = this.parseJsonField(value, fallback);
    return JSON.stringify(parsed, null, 2);
  }

  parseJsonField(value, fallback) {
    if (Array.isArray(value) || (value && typeof value === 'object')) return value;
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  normalizeTechnicalFields(raw = {}) {
    const out = {};
    const normalizeSystemType = (value) => {
      const s = String(value || '').trim();
      if (!s) return '';
      const lower = s.toLowerCase();
      if (lower.includes('беспровод') || /\bwireless\b/.test(lower) || /\brf\b/.test(lower)) return 'беспроводная';
      if (lower.includes('провод') || /\bwired\b/.test(lower)) return 'проводная';
      return s;
    };
    const normalizeProtocolToken = (value) => {
      const s = String(value || '').trim();
      if (!s) return '';
      if (/rs[\s-]?485/i.test(s)) return 'RS-485';
      if (/modbus/i.test(s)) return 'Modbus';
      if (/ethernet/i.test(s)) return 'Ethernet';
      if (/wi[\s-]?fi/i.test(s)) return 'Wi-Fi';
      if (/zigbee/i.test(s)) return 'Zigbee';
      if (/z[\s-]?wave/i.test(s)) return 'Z-Wave';
      if (/dali/i.test(s)) return 'DALI';
      if (/bluetooth|\bble\b/i.test(s)) return 'BLE';
      if (/knx/i.test(s)) return 'KNX';
      if (/mqtt/i.test(s)) return 'MQTT';
      if (/\bcan\b/i.test(s)) return 'CAN';
      return s;
    };
    const normalizeMountingToken = (value) => {
      const s = String(value || '').trim();
      if (!s) return '';
      const lower = s.toLowerCase();
      if (/din/i.test(s)) return 'DIN';
      if (lower.includes('подрозет') || /\brecessed\b/i.test(s)) return 'подрозетник';
      if (lower.includes('наклад') || /\bsurface\b/i.test(s) || /\bwall\b/i.test(s)) return 'накладной';
      if (lower.includes('встраив')) return 'встраиваемый';
      return s;
    };
    const normalizeChannels = (value) => {
      const m = String(value || '').match(/(\d+)/);
      if (!m) return '';
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n < 1 || n > 128) return '';
      return `${n} ch`;
    };
    const normalizeMetric = (kind, value) => {
      const s = String(value || '').trim();
      if (!s) return '';
      const m = s.match(/(-?\d+(?:[.,]\d+)?)\s*([a-zA-Zа-яА-Я]+)/);
      if (!m) return '';
      const n = Number(String(m[1]).replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) return '';
      const u = String(m[2] || '').toLowerCase();
      const num = String(Math.round(n * 100) / 100).replace('.', ',');
      if (kind === 'voltage') {
        if (/^(kv|кв)/.test(u)) return `${num} kV`;
        if (/^(mv|мв)/.test(u)) return `${num} mV`;
        if (/^(v|в)/.test(u)) return `${num} V`;
      }
      if (kind === 'current') {
        if (/^(ma|ма)/.test(u)) return `${num} mA`;
        if (/^(a|а)/.test(u)) return `${num} A`;
      }
      if (kind === 'power') {
        if (/^(kw|квт)/.test(u)) return `${num} kW`;
        if (/^(mw|мвт)/.test(u)) return `${num} mW`;
        if (/^(w|вт)/.test(u)) return `${num} W`;
      }
      return '';
    };

    if (Object.prototype.hasOwnProperty.call(raw, 'systemType')) out.systemType = normalizeSystemType(raw.systemType);
    if (Object.prototype.hasOwnProperty.call(raw, 'protocol')) {
      out.protocol = [...new Set(String(raw.protocol || '').split(/[;,|]+/g).map(normalizeProtocolToken).filter(Boolean))].join(', ');
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'mounting')) {
      out.mounting = [...new Set(String(raw.mounting || '').split(/[;,|]+/g).map(normalizeMountingToken).filter(Boolean))].join(', ');
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'supplyVoltage')) out.supplyVoltage = normalizeMetric('voltage', raw.supplyVoltage);
    if (Object.prototype.hasOwnProperty.call(raw, 'channels')) out.channels = normalizeChannels(raw.channels);
    if (Object.prototype.hasOwnProperty.call(raw, 'nominalCurrent')) out.nominalCurrent = normalizeMetric('current', raw.nominalCurrent);
    if (Object.prototype.hasOwnProperty.call(raw, 'nominalPower')) out.nominalPower = normalizeMetric('power', raw.nominalPower);
    return out;
  }

  async saveProduct() {
    if (!this.currentProduct) return;

    const priceRaw = document.getElementById('productPrice').value;
    const primaryFunctionalCategory = document.getElementById('productCategory').value;
    const functionalCategories = this.getSelectedFunctionalCategories();
    const primaryBrandCategoryRaw = String(document.getElementById('productPrimaryBrandCategory')?.value || '').trim();
    const brandCategoryIds = this.getSelectedBrandCategories();
    const primaryBrandCategoryId = Number(primaryBrandCategoryRaw || 0) || null;
    const selectedNativeBrandSubcategory = primaryBrandCategoryRaw.startsWith('native::')
      ? String(primaryBrandCategoryRaw.slice(8)).trim()
      : '';
    if (primaryFunctionalCategory && !functionalCategories.includes(primaryFunctionalCategory)) {
      functionalCategories.push(primaryFunctionalCategory);
    }
    if (!functionalCategories.length) {
      this.showError('Выберите категорию');
      return;
    }
    if (!brandCategoryIds.length && !selectedNativeBrandSubcategory) {
      this.showError('Выберите категорию бренда');
      return;
    }
    const nextStatus = document.getElementById('productStatus').value;
    if (nextStatus === 'active' && this.hasVariantConflict({ status: nextStatus }, this.currentVariants)) {
      this.showError('Cannot set product active: product has variants but no active variants.');
      return;
    }

    const attributesRaw = document.getElementById('productAttributesJson')?.value || '[]';
    try {
      JSON.parse(attributesRaw);
    } catch (error) {
      this.showError(`Invalid JSON in attributes: ${error.message}`);
      return;
    }

    const payload = {
      name: document.getElementById('productName').value,
      article: document.getElementById('productArticle').value,
      brand: document.getElementById('productBrand').value,
      category: primaryFunctionalCategory,
      primaryFunctionalCategory,
      functionalCategories,
      brandCategoryIds,
      primaryBrandCategoryId,
      brandSubcategory: selectedNativeBrandSubcategory,
      group: document.getElementById('productFunctionalCategories')?.value
        || document.getElementById('productGroup')?.value
        || '',
      price: priceRaw === '' ? '' : Number(priceRaw),
      description: document.getElementById('productDescription').value,
      status: nextStatus,
      isBrandFeatured: document.getElementById('productBrandFeatured')?.checked ? 1 : 0,
      attributesJson: attributesRaw,
      slug: document.getElementById('productSlug')?.value || '',
      metaTitle: document.getElementById('productMetaTitle')?.value || '',
      metaDescription: document.getElementById('productMetaDescription')?.value || ''
    };

    const optionalTechFieldIds = {
      systemType: 'productSystemType',
      protocol: 'productProtocol',
      mounting: 'productMounting',
      supplyVoltage: 'productSupplyVoltage',
      channels: 'productChannels',
      nominalCurrent: 'productNominalCurrent',
      nominalPower: 'productNominalPower'
    };
    const optionalRaw = {};
    for (const [key, id] of Object.entries(optionalTechFieldIds)) {
      const el = document.getElementById(id);
      if (el) optionalRaw[key] = el.value;
    }
    Object.assign(payload, this.normalizeTechnicalFields(optionalRaw));

    try {
      await this.fetchJson(`/api/admin/products/${this.currentProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      this.showSuccess('Товар сохранен');
      this.backToProducts();
      this.loadProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      this.showError(`Ошибка сохранения: ${error.message}`);
    }
  }

  switchEditorTab(tabName) {
    document.querySelectorAll('.editor-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('.editor-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `${tabName}Pane`);
    });

    if (tabName === 'variants') {
      this.renderVariantsTable();
    }
    if (tabName === 'content') {
      this.renderContentPane();
    }
    if (tabName === 'photos') {
      this.renderMediaTable();
    }
    if (tabName === 'documents') {
      this.renderDocumentsTable();
    }
    if (tabName === 'seo') {
      this.updateSeoPreview();
    }
  }

  setVariants(variants) {
    this.currentVariants = (variants || []).map((v) => this.normalizeVariant(v));
    this.updateVariantsCount();
    this.refreshQualityIndicator();
  }

  normalizeVariant(v) {
    return {
      id: v.id ?? null,
      sku: v.sku || '',
      optionSummary: v.optionSummary || v.option_summary || '',
      price: v.price ?? '',
      qty: v.qty ?? 0,
      status: v.status || 'draft',
      mediaMode: v.mediaMode || v.media_mode || 'inherit'
    };
  }

  updateVariantsCount() {
    const countEl = document.getElementById('variantsCount');
    if (countEl) countEl.textContent = `${this.currentVariants.length} шт.`;
  }

  renderVariantsTable() {
    const tbody = document.getElementById('variantsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!this.currentVariants.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="variants-empty">Вариантов пока нет</td></tr>';
      this.updateVariantsCount();
      this.refreshQualityIndicator();
      return;
    }

    this.currentVariants.forEach((variant, index) => {
      const tr = document.createElement('tr');
      tr.dataset.index = String(index);
      tr.dataset.id = variant.id == null ? '' : String(variant.id);

      tr.innerHTML = `
        <td><input class="input variant-sku" value="${variant.sku}" placeholder="SKU" /></td>
        <td><input class="input variant-option" value="${variant.optionSummary}" placeholder="Color=Black" /></td>
        <td><input class="input variant-price" type="number" min="0" step="0.01" value="${variant.price === null ? '' : variant.price}" /></td>
        <td><input class="input variant-qty" type="number" min="0" step="1" value="${variant.qty}" /></td>
        <td>
          <select class="select variant-status">
            <option value="draft" ${variant.status === 'draft' ? 'selected' : ''}>Черновик</option>
            <option value="active" ${variant.status === 'active' ? 'selected' : ''}>Активный</option>
            <option value="hidden" ${variant.status === 'hidden' ? 'selected' : ''}>Скрыт</option>
          </select>
        </td>
        <td class="variant-actions">
          <button class="btn btn-primary" type="button" data-variant-action="save" data-index="${index}">Сохранить</button>
          <button class="btn btn-outline" type="button" data-variant-action="delete" data-index="${index}">Удалить</button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    this.updateVariantsCount();
    this.refreshQualityIndicator();
  }

  readVariantRow(index) {
    const row = document.querySelector(`tr[data-index="${index}"]`);
    if (!row) return null;

    return {
      id: row.dataset.id ? Number(row.dataset.id) : null,
      sku: row.querySelector('.variant-sku')?.value?.trim() || '',
      optionSummary: row.querySelector('.variant-option')?.value?.trim() || '',
      price: row.querySelector('.variant-price')?.value,
      qty: row.querySelector('.variant-qty')?.value,
      status: row.querySelector('.variant-status')?.value || 'draft'
    };
  }

  addVariantRow() {
    if (!this.currentProduct) {
      this.showError('Сначала откройте товар');
      return;
    }

    this.currentVariants.push({
      id: null,
      sku: '',
      optionSummary: '',
      price: '',
      qty: 0,
      status: 'draft',
      mediaMode: 'inherit'
    });
    this.renderVariantsTable();
  }

  async saveVariantRow(index) {
    if (!this.currentProduct) return;

    const rowData = this.readVariantRow(index);
    if (!rowData) return;

    if (!rowData.sku) {
      this.showError('SKU обязателен для варианта');
      return;
    }

    const payload = {
      sku: rowData.sku,
      optionSummary: rowData.optionSummary,
      price: rowData.price === '' ? '' : Number(rowData.price),
      qty: Number(rowData.qty || 0),
      status: rowData.status
    };

    try {
      if (rowData.id) {
        await this.fetchJson(`/api/admin/variants/${rowData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        const createResult = await this.fetchJson(`/api/admin/products/${this.currentProduct.id}/variants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        payload.id = createResult?.variant?.id || null;
      }

      const latest = await this.fetchJson(`/api/admin/products/${this.currentProduct.id}/variants`);
      this.setVariants(latest.variants || []);
      this.renderVariantsTable();
      this.loadProducts();
      this.showSuccess('Вариант сохранен');
    } catch (error) {
      console.error('Save variant error:', error);
      this.showError(`Ошибка сохранения варианта: ${error.message}`);
    }
  }

  async deleteVariantRow(index) {
    if (!this.currentProduct) return;

    const rowData = this.readVariantRow(index);
    if (!rowData) return;

    if (!rowData.id) {
      this.currentVariants.splice(index, 1);
      this.renderVariantsTable();
      return;
    }

    if (!confirm('Удалить вариант?')) return;

    try {
      await this.fetchJson(`/api/admin/variants/${rowData.id}`, { method: 'DELETE' });
      this.currentVariants = this.currentVariants.filter((v) => Number(v.id) !== Number(rowData.id));
      this.renderVariantsTable();
      this.loadProducts();
      this.showSuccess('Вариант удален');
    } catch (error) {
      console.error('Delete variant error:', error);
      this.showError(`Ошибка удаления варианта: ${error.message}`);
    }
  }

  setMedia(media) {
    const baseMedia = Array.isArray(media) ? media : [];
    const fallbackMedia = (!baseMedia.length) ? this.buildMediaFromLegacyFields(this.currentProduct || {}) : [];
    const source = baseMedia.length ? baseMedia : fallbackMedia;
    this.currentMedia = source.map((item, index) => ({
      id: item?.id ?? null,
      url: String(item?.url || '').trim(),
      label: String(item?.label || '').trim(),
      variantId: item?.variantId == null ? '' : String(item.variantId),
      isCover: Boolean(item?.isCover),
      sortOrder: Number(item?.sortOrder ?? index)
    }));
    this.updateMediaCount();
    this.renderProductMainPhotoPreview();
    this.renderProductOverview();
  }

  buildMediaFromLegacyFields(product = {}) {
    const out = [];
    const seen = new Set();
    const pushUrl = (url, isCover = false, label = '') => {
      const value = String(url || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      out.push({
        id: null,
        url: value,
        label: String(label || '').trim(),
        variantId: '',
        isCover: Boolean(isCover),
        sortOrder: out.length
      });
    };

    const image = String(product?.image || '').trim();
    if (image) pushUrl(image, true, 'cover');

    const rawGallery = product?.galleryJson;
    let gallery = [];
    if (Array.isArray(rawGallery)) {
      gallery = rawGallery;
    } else {
      const text = String(rawGallery || '').trim();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          gallery = Array.isArray(parsed) ? parsed : [];
        } catch {
          gallery = [];
        }
      }
    }

    gallery.forEach((item) => {
      if (typeof item === 'string') {
        pushUrl(item, false, '');
        return;
      }
      if (item && typeof item === 'object') {
        const url = String(item.url || item.src || '').trim();
        if (!url) return;
        const label = String(item.label || item.alt || '').trim();
        const isCover = Number(item.isCover || 0) === 1 || Boolean(item.isCover);
        pushUrl(url, isCover, label);
      }
    });

    if (out.length > 1 && !out.some((x) => x.isCover)) {
      out[0].isCover = true;
    }
    return out;
  }

  updateMediaCount() {
    const el = document.getElementById('mediaCount');
    if (el) el.textContent = `${this.currentMedia.length} шт.`;
  }

  getPrimaryMediaPreview() {
    const items = Array.isArray(this.currentMedia) ? this.currentMedia : [];
    if (!items.length) return null;
    return items.find((item) => item && item.url && item.isCover)
      || items.find((item) => item && item.url)
      || null;
  }

  renderProductMainPhotoPreview() {
    const previewEl = document.getElementById('productMainPhotoPreview');
    const labelEl = document.getElementById('productMainPhotoLabel');
    const metaEl = document.getElementById('productMainPhotoMeta');
    if (!previewEl || !labelEl || !metaEl) return;

    const primary = this.getPrimaryMediaPreview();
    const total = Array.isArray(this.currentMedia)
      ? this.currentMedia.filter((item) => item && String(item.url || '').trim()).length
      : 0;

    if (!primary || !primary.url) {
      previewEl.innerHTML = '<span class="product-main-photo-empty">Фото пока не добавлено</span>';
      labelEl.textContent = 'Основное фото';
      metaEl.textContent = `${total} фото`;
      this.renderProductOverview();
      return;
    }

    previewEl.innerHTML = `<img src="${this.escapeHtml(primary.url)}" alt="${this.escapeHtml(primary.label || this.currentProduct?.name || 'Фото товара')}" loading="lazy" />`;
    labelEl.textContent = String(primary.label || '').trim() || 'Основное фото';
    metaEl.textContent = primary.isCover ? `${total} фото • cover` : `${total} фото`;
    this.renderProductOverview();
  }

  getSelectedOptionText(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    const option = el.options ? el.options[el.selectedIndex] : null;
    const value = String(el.value || '').trim();
    const label = String(option?.textContent || '').trim();
    if (!value) return '';
    return label || value;
  }

  getProductStatusLabel(status) {
    const map = {
      active: 'Опубликован',
      draft: 'Черновик',
      hidden: 'Скрыт',
      archived: 'Архив'
    };
    return map[String(status || '').toLowerCase()] || String(status || '—');
  }

  renderProductOverview() {
    const name = String(document.getElementById('productName')?.value || this.currentProduct?.name || '').trim();
    const article = String(document.getElementById('productArticle')?.value || this.currentProduct?.article || '').trim();
    const brand = this.getSelectedOptionText('productBrand') || String(this.currentProduct?.brand || '').trim();
    const category = this.getSelectedOptionText('productCategory') || String(this.currentProduct?.category || '').trim();
    const priceRaw = document.getElementById('productPrice')?.value ?? this.currentProduct?.price ?? '';
    const status = document.getElementById('productStatus')?.value || this.currentProduct?.status || 'active';
    const description = String(document.getElementById('productDescription')?.value || '').trim();
    const metaTitle = String(document.getElementById('productMetaTitle')?.value || '').trim();
    const metaDescription = String(document.getElementById('productMetaDescription')?.value || '').trim();
    const photoCount = Array.isArray(this.currentMedia)
      ? this.currentMedia.filter((item) => item && String(item.url || '').trim()).length
      : 0;
    const documentCount = Array.isArray(this.currentDocuments)
      ? this.currentDocuments.filter((item) => item && String(item.url || '').trim()).length
      : 0;

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText('productOverviewStatus', `Статус: ${this.getProductStatusLabel(status)}`);
    setText('productOverviewPrice', priceRaw !== '' ? this.formatPrice(priceRaw) : 'Цена не задана');
    setText('productOverviewName', name || 'Новый товар');
    setText('productOverviewArticle', article || '—');
    setText('productOverviewBrand', brand || '—');
    setText('productOverviewCategory', category || '—');
    setText('productOverviewPhotos', `${photoCount} фото`);

    const checks = [
      { label: 'Фото', ok: photoCount > 0 },
      { label: 'Цена', ok: Number(priceRaw) > 0 },
      { label: 'Бренд', ok: Boolean(brand) },
      { label: 'Категория', ok: Boolean(category) },
      { label: 'Описание', ok: description.length >= 40 },
      { label: 'SEO title', ok: Boolean(metaTitle) },
      { label: 'SEO description', ok: Boolean(metaDescription) },
      { label: 'Документы', ok: documentCount > 0 }
    ];
    const checklist = document.getElementById('productQualityChecklist');
    if (checklist) {
      checklist.innerHTML = checks.map((item) => (
        `<span class="product-quality-chip ${item.ok ? 'is-ok' : 'is-missing'}">${item.ok ? '✓' : '!'} ${this.escapeHtml(item.label)}</span>`
      )).join('');
    }
  }
  renderMediaTable() {
    const tbody = document.getElementById('mediaTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!this.currentMedia.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="variants-empty">Фото пока нет</td></tr>';
      this.updateMediaCount();
      this.renderProductMainPhotoPreview();
      return;
    }
    this.currentMedia.forEach((m, index) => {
      const tr = document.createElement('tr');
      const previewHtml = m.url
        ? `<img src="${this.escapeHtml(m.url)}" alt="${this.escapeHtml(m.label || this.currentProduct?.name || 'Фото товара')}" loading="lazy" />`
        : '<span class="admin-media-preview-empty">Нет фото</span>';
      tr.innerHTML = `
        <td><div class="admin-media-preview-cell">${previewHtml}</div></td>
        <td><input class="input media-url" value="${this.escapeHtml(m.url)}" placeholder="https://..." /></td>
        <td><input class="input media-label" value="${this.escapeHtml(m.label)}" placeholder="cover" /></td>
        <td><input class="input media-variant" value="${this.escapeHtml(String(m.variantId || ''))}" placeholder="" /></td>
        <td style="text-align:center;"><input type="checkbox" class="media-cover" ${m.isCover ? 'checked' : ''} /></td>
        <td><input class="input media-order" type="number" min="0" step="1" value="${m.sortOrder}" /></td>
        <td><button class="btn btn-outline btn-xs media-action-btn" type="button" data-media-action="delete" data-index="${index}" aria-label="Удалить фото"><span class="material-symbols-rounded msi" aria-hidden="true">delete</span></button></td>
      `;
      const urlInput = tr.querySelector('.media-url');
      const previewCell = tr.querySelector('.admin-media-preview-cell');
      const syncPreview = () => {
        const value = String(urlInput?.value || '').trim();
        if (!previewCell) return;
        if (!value) {
          previewCell.innerHTML = '<span class="admin-media-preview-empty">Нет фото</span>';
          return;
        }
        previewCell.innerHTML = `<img src="${this.escapeHtml(value)}" alt="${this.escapeHtml(this.currentProduct?.name || 'Фото товара')}" loading="lazy" />`;
      };
      urlInput?.addEventListener('input', syncPreview);
      tbody.appendChild(tr);
    });
    this.updateMediaCount();
    this.renderProductMainPhotoPreview();
  }

  addMediaRow() {
    this.currentMedia.push({
      id: null,
      url: '',
      label: '',
      variantId: '',
      isCover: this.currentMedia.length === 0,
      sortOrder: this.currentMedia.length
    });
    this.renderMediaTable();
  }

  deleteMediaRow(index) {
    this.currentMedia.splice(index, 1);
    this.currentMedia.forEach((m, i) => {
      if (!Number.isFinite(Number(m.sortOrder))) m.sortOrder = i;
    });
    this.renderMediaTable();
  }

  readMediaRows() {
    const rows = Array.from(document.querySelectorAll('#mediaTableBody tr'));
    return rows
      .map((row, index) => ({
        url: row.querySelector('.media-url')?.value?.trim() || '',
        label: row.querySelector('.media-label')?.value?.trim() || '',
        variantId: row.querySelector('.media-variant')?.value?.trim() || '',
        isCover: Boolean(row.querySelector('.media-cover')?.checked),
        sortOrder: Number(row.querySelector('.media-order')?.value ?? index)
      }))
      .filter((item) => item.url);
  }

  async saveMedia() {
    if (!this.currentProduct?.id) return;
    const media = this.readMediaRows();
    try {
      const result = await this.fetchJson(`/api/admin/products/${this.currentProduct.id}/media`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media })
      });
      this.setMedia(result.media || media);
      this.renderMediaTable();
      this.showSuccess('Фото сохранены');
      await this.loadProducts();
    } catch (error) {
      this.showError(`Ошибка сохранения фото: ${error.message}`);
    }
  }

  setDocuments(documents) {
    this.currentDocuments = (Array.isArray(documents) ? documents : []).map((item, index) => ({
      id: item?.id ?? null,
      title: String(item?.title || '').trim(),
      type: String(item?.type || '').trim(),
      lang: String(item?.lang || '').trim(),
      url: String(item?.url || '').trim(),
      variantId: item?.variantId == null ? '' : String(item.variantId),
      sortOrder: Number(item?.sortOrder ?? index)
    }));
    this.updateDocumentsCount();
    this.renderProductOverview();
  }

  updateDocumentsCount() {
    const el = document.getElementById('documentsCount');
    if (el) el.textContent = `${this.currentDocuments.length} шт.`;
  }

  renderDocumentsTable() {
    const tbody = document.getElementById('documentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!this.currentDocuments.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="variants-empty">Документов пока нет</td></tr>';
      this.updateDocumentsCount();
      return;
    }
    this.currentDocuments.forEach((d, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="input doc-title" value="${this.escapeHtml(d.title)}" placeholder="Manual" /></td>
        <td><input class="input doc-type" value="${this.escapeHtml(d.type)}" placeholder="instruction" /></td>
        <td><input class="input doc-lang" value="${this.escapeHtml(d.lang)}" placeholder="ru" /></td>
        <td><input class="input doc-url" value="${this.escapeHtml(d.url)}" placeholder="https://..." /></td>
        <td><input class="input doc-variant" value="${this.escapeHtml(String(d.variantId || ''))}" /></td>
        <td><input class="input doc-order" type="number" min="0" step="1" value="${d.sortOrder}" /></td>
        <td><button class="btn btn-outline" type="button" data-document-action="delete" data-index="${index}">Удалить</button></td>
      `;
      tbody.appendChild(tr);
    });
    this.updateDocumentsCount();
  }

  addDocumentRow() {
    this.currentDocuments.push({
      id: null,
      title: '',
      type: '',
      lang: '',
      url: '',
      variantId: '',
      sortOrder: this.currentDocuments.length
    });
    this.renderDocumentsTable();
  }

  deleteDocumentRow(index) {
    this.currentDocuments.splice(index, 1);
    this.currentDocuments.forEach((d, i) => {
      if (!Number.isFinite(Number(d.sortOrder))) d.sortOrder = i;
    });
    this.renderDocumentsTable();
  }

  readDocumentRows() {
    const rows = Array.from(document.querySelectorAll('#documentsTableBody tr'));
    return rows
      .map((row, index) => ({
        title: row.querySelector('.doc-title')?.value?.trim() || '',
        type: row.querySelector('.doc-type')?.value?.trim() || '',
        lang: row.querySelector('.doc-lang')?.value?.trim() || '',
        url: row.querySelector('.doc-url')?.value?.trim() || '',
        variantId: row.querySelector('.doc-variant')?.value?.trim() || '',
        sortOrder: Number(row.querySelector('.doc-order')?.value ?? index)
      }))
      .filter((item) => item.url);
  }

  async saveDocuments() {
    if (!this.currentProduct?.id) return;
    const documents = this.readDocumentRows();
    try {
      const result = await this.fetchJson(`/api/admin/products/${this.currentProduct.id}/documents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents })
      });
      this.setDocuments(result.documents || documents);
      this.renderDocumentsTable();
      this.showSuccess('Документы сохранены');
      await this.loadProducts();
    } catch (error) {
      this.showError(`Ошибка сохранения документов: ${error.message}`);
    }
  }

  async loadContentTabs() {
    if (!this.currentProduct?.id) return;
    try {
      const data = await this.fetchJson(`/api/admin/products/${this.currentProduct.id}/tabs`);
      this.currentContentTabs = Array.isArray(data.tabs) ? data.tabs : [];
      if (!this.selectedContentTabId && this.currentContentTabs.length) {
        this.selectedContentTabId = this.currentContentTabs[0].id;
      }
      if (this.selectedContentTabId && !this.currentContentTabs.some((t) => Number(t.id) === Number(this.selectedContentTabId))) {
        this.selectedContentTabId = this.currentContentTabs[0]?.id ?? null;
      }
      this.renderContentPane();
    } catch (error) {
      console.error('Content tabs load error:', error);
      this.showError(`Ошибка загрузки вкладок: ${error.message}`);
    }
  }

  renderContentPane() {
    const listEl = document.getElementById('contentTabsList');
    const emptyEl = document.getElementById('contentEmptyState');
    const bodyEl = document.getElementById('contentEditorBody');
    if (!listEl || !emptyEl || !bodyEl) return;

    listEl.innerHTML = '';
    if (!this.currentContentTabs.length) {
      listEl.innerHTML = '<div class=\"content-empty\" style=\"padding:12px;\">Вкладок пока нет</div>';
      emptyEl.style.display = 'block';
      bodyEl.style.display = 'none';
      return;
    }

    this.currentContentTabs.forEach((tab) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `content-tab-item ${Number(tab.id) === Number(this.selectedContentTabId) ? 'active' : ''}`;
      btn.textContent = tab.title || tab.code || `Tab ${tab.id}`;
      btn.dataset.contentTabId = String(tab.id);
      listEl.appendChild(btn);
    });

    const tab = this.getSelectedContentTab();
    if (!tab) {
      emptyEl.style.display = 'block';
      bodyEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    bodyEl.style.display = 'block';

    const titleInput = document.getElementById('tabTitleInput');
    const codeInput = document.getElementById('tabCodeInput');
    const enabledInput = document.getElementById('tabEnabledInput');
    if (titleInput) titleInput.value = tab.title || '';
    if (codeInput) codeInput.value = tab.code || '';
    if (enabledInput) enabledInput.value = tab.enabled ? '1' : '0';

    const blocksEl = document.getElementById('contentBlocksList');
    if (!blocksEl) return;
    blocksEl.innerHTML = '';

    const blocks = Array.isArray(tab.blocks) ? tab.blocks : [];
    if (!blocks.length) {
      blocksEl.innerHTML = '<div class=\"content-empty\" style=\"padding:12px;\">Блоков пока нет</div>';
      return;
    }

    blocks.forEach((block, index) => {
      const row = document.createElement('div');
      row.className = 'content-block-row';
      row.dataset.index = String(index);
      const text = typeof block.content?.text === 'string' ? block.content.text : '';
      const title = typeof block.content?.title === 'string' ? block.content.title : '';
      const imageUrl = typeof block.content?.url === 'string' ? block.content.url : '';
      const tableRows = Array.isArray(block.content?.rows) ? block.content.rows : [];

      row.innerHTML = `
        <div class=\"content-block-grid\">
          <select class=\"select content-block-type\">
            <option value=\"text\" ${block.blockType === 'text' ? 'selected' : ''}>Текст</option>
            <option value=\"table\" ${block.blockType === 'table' ? 'selected' : ''}>Таблица</option>
            <option value=\"image\" ${block.blockType === 'image' ? 'selected' : ''}>Картинка</option>
          </select>
          <div>
            <input class=\"input content-block-title\" placeholder=\"Заголовок (опц.)\" value=\"${title}\">
            <textarea class=\"textarea content-block-text\" rows=\"3\" placeholder=\"Содержимое блока\">${text}</textarea>
            <input class=\"input content-block-url\" placeholder=\"URL картинки (для image)\" value=\"${imageUrl}\">
            <div class=\"table-editor\">
              <div class=\"table-editor-head\">
                <strong>Таблица Параметр / Значение</strong>
                <button class=\"btn btn-outline btn-xs\" type=\"button\" data-content-action=\"add-table-row\" data-block-index=\"${index}\">+ Строка</button>
              </div>
              <div class=\"table-rows\" data-block-index=\"${index}\">
                ${
                  tableRows.length
                    ? tableRows
                        .map(
                          (r, ridx) => `
                    <div class=\"table-row-item\">
                      <input class=\"input table-param\" placeholder=\"Параметр\" value=\"${(r?.param ?? '').toString()}\">
                      <input class=\"input table-value\" placeholder=\"Значение\" value=\"${(r?.value ?? '').toString()}\">
                      <button class=\"btn btn-outline btn-xs\" type=\"button\" data-content-action=\"remove-table-row\" data-block-index=\"${index}\" data-row-index=\"${ridx}\">Удалить</button>
                    </div>
                  `
                        )
                        .join('')
                    : '<div class=\"table-empty\">Нет строк. Добавьте первую.</div>'
                }
              </div>
            </div>
          </div>
          <button class=\"btn btn-outline\" type=\"button\" data-content-action=\"remove-block\" data-block-index=\"${index}\">Удалить</button>
        </div>
      `;
      blocksEl.appendChild(row);

      const typeSelect = row.querySelector('.content-block-type');
      const textArea = row.querySelector('.content-block-text');
      const urlInput = row.querySelector('.content-block-url');
      const tableEditor = row.querySelector('.table-editor');
      const syncVisibility = () => {
        const type = typeSelect?.value || 'text';
        if (textArea) textArea.style.display = type === 'image' ? 'none' : 'block';
        if (urlInput) urlInput.style.display = type === 'image' ? 'block' : 'none';
        if (tableEditor) tableEditor.style.display = type === 'table' ? 'block' : 'none';
      };
      typeSelect?.addEventListener('change', syncVisibility);
      syncVisibility();
    });
  }

  getSelectedContentTab() {
    return this.currentContentTabs.find((t) => Number(t.id) === Number(this.selectedContentTabId)) || null;
  }

  selectContentTab(tabId) {
    this.selectedContentTabId = Number(tabId);
    this.renderContentPane();
  }

  async addContentTab() {
    if (!this.currentProduct?.id) {
      this.showError('Сначала откройте товар');
      return;
    }
    try {
      const payload = {
        title: 'Новая вкладка',
        code: `tab_${Date.now()}`,
        enabled: true,
        sortOrder: this.currentContentTabs.length
      };
      const result = await this.fetchJson(`/api/admin/products/${this.currentProduct.id}/tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      this.selectedContentTabId = result?.tab?.id ?? null;
      await this.loadContentTabs();
      this.showSuccess('Вкладка добавлена');
    } catch (error) {
      console.error('Add content tab error:', error);
      this.showError(`Ошибка создания вкладки: ${error.message}`);
    }
  }

  addContentBlock() {
    const tab = this.getSelectedContentTab();
    if (!tab) return;
    if (!Array.isArray(tab.blocks)) tab.blocks = [];
    tab.blocks.push({
      blockType: 'text',
      content: { title: '', text: '' },
      sortOrder: tab.blocks.length
    });
    this.renderContentPane();
  }

  removeContentBlock(index) {
    const tab = this.getSelectedContentTab();
    if (!tab || !Array.isArray(tab.blocks)) return;
    tab.blocks.splice(index, 1);
    this.renderContentPane();
  }

  addTableRowToBlock(blockIndex) {
    const rowsWrap = document.querySelector(`.table-rows[data-block-index=\"${blockIndex}\"]`);
    if (!rowsWrap) return;
    const empty = rowsWrap.querySelector('.table-empty');
    if (empty) empty.remove();
    const row = document.createElement('div');
    row.className = 'table-row-item';
    row.innerHTML = `
      <input class=\"input table-param\" placeholder=\"Параметр\" value=\"\">
      <input class=\"input table-value\" placeholder=\"Значение\" value=\"\">
      <button class=\"btn btn-outline btn-xs\" type=\"button\" data-content-action=\"remove-table-row-node\">Удалить</button>
    `;
    rowsWrap.appendChild(row);
  }

  removeTableRowNode(btn) {
    const line = btn?.closest('.table-row-item');
    const wrap = btn?.closest('.table-rows');
    if (line) line.remove();
    if (wrap && wrap.querySelectorAll('.table-row-item').length === 0) {
      wrap.innerHTML = '<div class=\"table-empty\">Нет строк. Добавьте первую.</div>';
    }
  }

  removeTableRowFromBlock(blockIndex, rowIndex) {
    const wrap = document.querySelector(`.table-rows[data-block-index=\"${blockIndex}\"]`);
    if (!wrap) return;
    const rows = Array.from(wrap.querySelectorAll('.table-row-item'));
    const target = rows[rowIndex];
    if (target) target.remove();
    if (wrap.querySelectorAll('.table-row-item').length === 0) {
      wrap.innerHTML = '<div class=\"table-empty\">Нет строк. Добавьте первую.</div>';
    }
  }

  readBlocksFromEditor() {
    const tab = this.getSelectedContentTab();
    if (!tab) return [];
    const rows = Array.from(document.querySelectorAll('#contentBlocksList .content-block-row'));
    return rows.map((row, index) => {
      const type = row.querySelector('.content-block-type')?.value || 'text';
      const title = row.querySelector('.content-block-title')?.value?.trim() || '';
      const text = row.querySelector('.content-block-text')?.value?.trim() || '';
      const url = row.querySelector('.content-block-url')?.value?.trim() || '';
      const tableRows = Array.from(row.querySelectorAll('.table-row-item')).map((line) => ({
        param: line.querySelector('.table-param')?.value?.trim() || '',
        value: line.querySelector('.table-value')?.value?.trim() || ''
      })).filter((it) => it.param || it.value);
      const content = { title, text };
      if (url) content.url = url;
      if (type === 'table') content.rows = tableRows;
      return { blockType: type, content, sortOrder: index };
    });
  }

  async saveContentTab() {
    const tab = this.getSelectedContentTab();
    if (!tab?.id) {
      this.showError('Выберите вкладку');
      return;
    }

    const title = document.getElementById('tabTitleInput')?.value?.trim() || '';
    const code = document.getElementById('tabCodeInput')?.value?.trim() || '';
    const enabled = document.getElementById('tabEnabledInput')?.value === '1';
    if (!title || !code) {
      this.showError('У вкладки должны быть title и code');
      return;
    }

    const blocks = this.readBlocksFromEditor();

    try {
      await this.fetchJson(`/api/admin/tabs/${tab.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, code, enabled })
      });
      await this.fetchJson(`/api/admin/tabs/${tab.id}/blocks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      });
      await this.loadContentTabs();
      this.showSuccess('Вкладка сохранена');
    } catch (error) {
      console.error('Save content tab error:', error);
      this.showError(`Ошибка сохранения вкладки: ${error.message}`);
    }
  }

  async deleteContentTab() {
    const tab = this.getSelectedContentTab();
    if (!tab?.id) return;
    if (!confirm(`Удалить вкладку \"${tab.title}\"?`)) return;
    try {
      await this.fetchJson(`/api/admin/tabs/${tab.id}`, { method: 'DELETE' });
      if (Number(this.selectedContentTabId) === Number(tab.id)) {
        this.selectedContentTabId = null;
      }
      await this.loadContentTabs();
      this.showSuccess('Вкладка удалена');
    } catch (error) {
      console.error('Delete content tab error:', error);
      this.showError(`Ошибка удаления вкладки: ${error.message}`);
    }
  }

  updatePagination(pagination) {
    this.pagination = { ...this.pagination, ...pagination };
    this.renderPagination();
  }

  renderPagination() {
    const paginationEl = document.getElementById('pagination');
    if (!paginationEl) return;

    const { offset, limit, total, hasMore } = this.pagination;
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const canGoNext = total > 0 ? currentPage < totalPages : !!hasMore;
    const canGoPrev = currentPage > 1;

    let html = `
      <div class="pagination-info">Показано ${Math.min(offset + 1, total || 0)}-${Math.min(offset + limit, total)} из ${total}</div>
      <div class="pagination-controls">
        <button class="pagination-btn" ${!canGoPrev ? 'disabled' : ''} data-page="${currentPage - 1}">← Назад</button>
    `;

    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    for (let i = startPage; i <= endPage; i += 1) {
      html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    html += `<button class="pagination-btn" ${!canGoNext ? 'disabled' : ''} data-page="${currentPage + 1}">Вперед →</button></div>`;
    paginationEl.innerHTML = html;
  }

  goToPage(page) {
    const total = Number(this.pagination.total || 0);
    const limit = Math.max(1, Number(this.pagination.limit || 50));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const targetPage = Math.max(1, Math.min(totalPages, Number(page) || 1));
    const nextOffset = (targetPage - 1) * limit;
    if (nextOffset === this.pagination.offset) return;
    this.pagination.offset = nextOffset;
    this.loadProducts();
  }

  updateTableInfo(pagination) {
    const tableInfo = document.getElementById('tableInfo');
    if (tableInfo) {
      const local = this.loadedProducts.length;
      const filtered = this.filteredRowsCount || 0;
      const limit = Math.max(1, Number(pagination.limit || this.pagination.limit || 50));
      const currentPage = Math.floor(Number(pagination.offset || 0) / limit) + 1;
      const totalPages = Math.max(1, Math.ceil(Number(pagination.total || 0) / limit));
      tableInfo.textContent = `Всего товаров: ${pagination.total}. Страница: ${currentPage}/${totalPages}. На странице: ${local}, после фильтров колонок: ${filtered}`;
    }
  }

  createProduct() {
    const baseCategory = this.availableFilters.categories[0] || '';
    const baseBrand = this.availableFilters.brands[0] || '';
    const payload = {
      name: 'New Product',
      article: '',
      brand: baseBrand,
      category: baseCategory,
      primaryFunctionalCategory: baseCategory,
      functionalCategories: baseCategory ? [baseCategory] : [],
      group: '',
      price: '',
      status: 'draft',
      image: '',
      attributesJson: '[]',
      galleryJson: '[]',
      documentsJson: '[]'
    };

    this.fetchJson('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((result) => {
        const created = result?.product;
        if (!created?.id) {
          throw new Error('Failed to create product');
        }
        this.summaryProducts = null;
        return this.editProduct(created.id);
      })
      .then(() => {
        this.showSuccess('Product created');
      })
      .catch((error) => {
        this.showError(`Create product failed: ${error.message}`);
      });
  }

  async loadAllProductsForExport() {
    const out = [];
    const pageLimit = 500;
    let offset = 0;
    let guard = 0;
    const baseFilters = { ...(this.currentFilters || {}) };

    while (guard < 300) {
      guard += 1;
      const params = new URLSearchParams({
        ...baseFilters,
        limit: String(pageLimit),
        offset: String(offset)
      });
      const data = await this.fetchJson(`/api/admin/products?${params.toString()}`);
      const rows = Array.isArray(data.products) ? data.products : (Array.isArray(data.rows) ? data.rows : []);
      if (!rows.length) break;
      out.push(...rows);
      const pagination = data.pagination || {};
      if (!pagination.hasMore) break;
      offset += pageLimit;
    }

    return out
      .filter((product) => this.matchesColumnFilters(product))
      .sort((a, b) => this.compareProducts(a, b));
  }

  async exportProducts() {
    try {
      const rows = await this.loadAllProductsForExport();
      if (!rows.length) {
        this.showError('Нет товаров для экспорта');
        return;
      }
      const columns = [
        ['id', 'ID'],
        ['name', 'Название'],
        ['article', 'SKU'],
        ['brand', 'Бренд'],
        ['category', 'Категория'],
        ['group', 'Подкатегория'],
        ['price', 'Цена'],
        ['status', 'Статус'],
        ['updatedAt', 'Обновлено']
      ];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = columns.map(([, title]) => esc(title)).join(',');
      const body = rows.map((row) => columns.map(([key]) => esc(row[key])).join(',')).join('\n');
      const csv = `${header}\n${body}`;
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `products-export-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.showSuccess(`Экспорт: ${rows.length} товаров`);
    } catch (error) {
      this.showError(`Ошибка экспорта: ${error.message}`);
    }
  }

  parseCsvLine(line, delimiter = ',') {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((x) => String(x || '').trim());
  }

  normalizeImportKey(key) {
    return String(key || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[_.-]/g, '');
  }

  mapImportRow(raw) {
    const row = raw || {};
    const get = (...keys) => {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
      }
      return '';
    };
    return {
      name: String(get('name', 'название') || '').trim(),
      article: String(get('article', 'sku', 'артикул') || '').trim(),
      brand: String(get('brand', 'бренд') || '').trim(),
      category: String(get('category', 'категория') || '').trim(),
      group: String(get('group', 'groupname', 'subcategory', 'подкатегория') || '').trim(),
      price: get('price', 'цена'),
      status: String(get('status', 'статус') || 'draft').trim(),
      image: String(get('image', 'изображение', 'фото') || '').trim()
    };
  }

  parseImportProductsText(text, fileName = '') {
    const fileLower = String(fileName || '').toLowerCase();
    const raw = String(text || '');
    const looksLikeJson = fileLower.endsWith('.json') || raw.trim().startsWith('[') || raw.trim().startsWith('{');
    if (looksLikeJson) {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.products) ? parsed.products : []);
      return list.map((row) => this.mapImportRow(row));
    }

    const lines = raw
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const headerLine = lines[0];
    const delimiters = [',', ';', '\t'];
    const delimiter = delimiters
      .map((d) => ({ d, c: Math.max(0, headerLine.split(d).length - 1) }))
      .sort((a, b) => b.c - a.c)[0]?.d || ',';
    const header = this.parseCsvLine(headerLine, delimiter).map((h) => this.normalizeImportKey(h));
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cols = this.parseCsvLine(lines[i], delimiter);
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cols[idx] ?? ''; });
      rows.push(this.mapImportRow(obj));
    }
    return rows;
  }

  importProducts() {
    let input = document.getElementById('productsImportInput');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'productsImportInput';
      input.accept = '.json,.csv,application/json,text/csv';
      input.style.display = 'none';
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const rows = this.parseImportProductsText(text, file.name);
          if (!rows.length) throw new Error('Пустой список товаров');
          if (!confirm(`Импортировать ${rows.length} товаров?`)) return;
          let ok = 0;
          let fail = 0;
          for (const row of rows) {
            const payload = this.mapImportRow(row);
            if (!payload.name) { fail += 1; continue; }
            try {
              await this.fetchJson('/api/admin/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              ok += 1;
            } catch {
              fail += 1;
            }
          }
          await this.loadProducts();
          this.showSuccess(`Импорт завершен: ${ok} усп., ${fail} ошиб.`);
        } catch (error) {
          this.showError(`Импорт не выполнен: ${error.message}`);
        } finally {
          input.value = '';
        }
      });
      document.body.appendChild(input);
    }
    input.click();
  }

  async createBrand() {
    const name = document.getElementById('newBrandName')?.value?.trim() || '';
    if (!name) {
      this.showError('Введите название бренда');
      return;
    }
    try {
      await this.fetchJson('/api/admin/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const input = document.getElementById('newBrandName');
      if (input) input.value = '';
      await this.loadTaxonomyDictionaries();
      this.showSuccess('Бренд создан');
    } catch (error) {
      this.showError('Ошибка создания бренда: ' + error.message);
    }
  }

  async createFunctionalCategory() {
    const name = document.getElementById('newFunctionalCategoryName')?.value?.trim() || '';
    const parentIdRaw = document.getElementById('newFunctionalCategoryParentId')?.value || '';
    if (!name) {
      this.showError('Введите название функциональной категории');
      return;
    }
    if (!parentIdRaw) {
      this.showError('Сначала выберите одну из 8 функциональных категорий');
      return;
    }
    try {
      await this.fetchJson('/api/admin/functional-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentId: Number(parentIdRaw)
        })
      });
      const nameInput = document.getElementById('newFunctionalCategoryName');
      const parentInput = document.getElementById('newFunctionalCategoryParentId');
      if (nameInput) nameInput.value = '';
      if (parentInput) parentInput.value = '';
      await this.loadTaxonomyDictionaries();
      this.showSuccess('Функциональная категория создана');
    } catch (error) {
      this.showError('Ошибка создания функциональной категории: ' + error.message);
    }
  }

  async createBrandCategory() {
    const brandId = Number(document.getElementById('newBrandCategoryBrandId')?.value || 0);
    const name = document.getElementById('newBrandCategoryName')?.value?.trim() || '';
    if (!brandId || !name) {
      this.showError('Укажите бренд и название брендовой категории');
      return;
    }
    try {
      await this.fetchJson('/api/admin/brand-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          name,
          parentId: null
        })
      });
      const nameInput = document.getElementById('newBrandCategoryName');
      if (nameInput) nameInput.value = '';
      await this.loadTaxonomyDictionaries();
      this.showSuccess('Брендовая категория создана');
    } catch (error) {
      this.showError('Ошибка создания брендовой категории: ' + error.message);
    }
  }

  async editBrand(brandId) {
    const row = (this.catalogTaxonomy.brands || []).find((x) => Number(x.id) === Number(brandId));
    if (!row) {
      this.showError('Бренд не найден в текущем списке. Обновите страницу и повторите.');
      return;
    }
    const nextName = prompt('Название бренда', row.name || '');
    if (nextName == null) return;
    const name = String(nextName).trim();
    if (!name) return;
    try {
      await this.fetchJson('/api/admin/brands/' + brandId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      await this.loadTaxonomyDictionaries();
      await this.loadFilters();
      this.showSuccess('Бренд обновлен');
    } catch (error) {
      this.showError('Ошибка обновления бренда: ' + error.message);
    }
  }

  async deleteBrand(brandId) {
    if (!confirm('Удалить бренд #' + brandId + '?')) return;
    try {
      await this.fetchJson('/api/admin/brands/' + brandId, { method: 'DELETE' });
      await this.loadTaxonomyDictionaries();
      await this.loadFilters();
      this.showSuccess('Бренд удален');
    } catch (error) {
      this.showError('Ошибка удаления бренда: ' + error.message);
    }
  }

  async editFunctionalCategory(categoryId) {
    const row = (this.catalogTaxonomy.functionalCategories || []).find((x) => Number(x.id) === Number(categoryId));
    if (!row) {
      this.showError('Категория не найдена в текущем списке. Обновите страницу и повторите.');
      return;
    }
    const nextName = prompt('Название функциональной категории', row.name || '');
    if (nextName == null) return;
    const name = String(nextName).trim();
    if (!name) return;
    const parentIdRaw = prompt('Родитель ID (пусто = корень)', row.parentId == null ? '' : String(row.parentId));
    if (parentIdRaw == null) return;
    try {
      await this.fetchJson('/api/admin/functional-categories/' + categoryId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentId: String(parentIdRaw).trim() ? Number(parentIdRaw) : null
        })
      });
      await this.loadTaxonomyDictionaries();
      await this.loadFilters();
      this.showSuccess('Функциональная категория обновлена');
    } catch (error) {
      this.showError('Ошибка обновления функциональной категории: ' + error.message);
    }
  }

  async deleteFunctionalCategory(categoryId) {
    if (!confirm('Удалить функциональную категорию #' + categoryId + '?')) return;
    try {
      await this.fetchJson('/api/admin/functional-categories/' + categoryId, { method: 'DELETE' });
      await this.loadTaxonomyDictionaries();
      await this.loadFilters();
      this.showSuccess('Функциональная категория удалена');
    } catch (error) {
      this.showError('Ошибка удаления функциональной категории: ' + error.message);
    }
  }

  async editBrandCategory(categoryId) {
    const row = (this.catalogTaxonomy.brandCategories || []).find((x) => Number(x.id) === Number(categoryId));
    if (!row) {
      this.showError('Брендовая категория не найдена в текущем списке. Обновите страницу и повторите.');
      return;
    }
    const nextName = prompt('Название брендовой категории', row.name || '');
    if (nextName == null) return;
    const name = String(nextName).trim();
    if (!name) return;
    try {
      await this.fetchJson('/api/admin/brand-categories/' + categoryId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          brandId: Number(row.brandId),
          parentId: null
        })
      });
      await this.loadTaxonomyDictionaries();
      this.showSuccess('Брендовая категория обновлена');
    } catch (error) {
      this.showError('Ошибка обновления брендовой категории: ' + error.message);
    }
  }

  async deleteBrandCategory(categoryId) {
    if (!confirm('Удалить брендовую категорию #' + categoryId + '?')) return;
    try {
      await this.fetchJson('/api/admin/brand-categories/' + categoryId, { method: 'DELETE' });
      await this.loadTaxonomyDictionaries();
      this.showSuccess('Брендовая категория удалена');
    } catch (error) {
      this.showError('Ошибка удаления брендовой категории: ' + error.message);
    }
  }

  previewProduct() {
    if (!this.currentProduct?.id) {
      this.showError('Сначала сохраните товар, чтобы открыть предпросмотр');
      return;
    }
    const productId = encodeURIComponent(String(this.currentProduct.id));
    const previewUrl = `${window.location.origin}/#/product/${productId}`;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  }

  duplicateProduct() {
    if (!this.currentProduct?.id) return;
    this.fetchJson(`/api/admin/products/${encodeURIComponent(this.currentProduct.id)}`)
      .then((res) => {
        const src = res?.product || {};
        const payload = {
          name: `${String(src.name || 'New Product')} (copy)`,
          article: '',
          brand: String(src.brand || ''),
          category: String(src.category || ''),
          primaryFunctionalCategory: String(src.primaryFunctionalCategory || src.category || ''),
          functionalCategories: Array.isArray(src.functionalCategories) ? src.functionalCategories : [],
          group: String(src.group || src.groupName || ''),
          price: src.price ?? '',
          status: 'draft',
          image: String(src.image || ''),
          attributesJson: String(src.attributesJson || '[]'),
          galleryJson: String(src.galleryJson || '[]'),
          documentsJson: String(src.documentsJson || '[]')
        };
        return this.fetchJson('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      })
      .then((createdRes) => {
        const created = createdRes?.product;
        if (!created?.id) throw new Error('Duplicate failed');
        this.showSuccess('Товар дублирован');
        return this.editProduct(created.id);
      })
      .catch((error) => {
        this.showError(`Не удалось дублировать: ${error.message}`);
      });
  }

  archiveProduct() {
    if (!this.currentProduct?.id) return;
    if (!confirm('Отправить товар в архив?')) return;
    this.fetchJson(`/api/admin/products/${encodeURIComponent(this.currentProduct.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' })
    })
      .then(() => {
        this.currentProduct.status = 'archived';
        const statusSelect = document.getElementById('productStatus');
        if (statusSelect) statusSelect.value = 'archived';
        this.refreshQualityIndicator();
        this.showSuccess('Товар архивирован');
      })
      .catch((error) => {
        this.showError(`Ошибка архивации: ${error.message}`);
      });
  }


  async deleteProduct() {
    if (!this.currentProduct?.id) return;
    if (!confirm(`Удалить товар "${this.currentProduct.name}"?`)) return;

    try {
      await this.fetchJson('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', productIds: [this.currentProduct.id] })
      });
      this.showSuccess('Товар удален');
      this.backToProducts();
      this.loadProducts();
    } catch (error) {
      this.showError(`Ошибка удаления: ${error.message}`);
    }
  }

  async deleteProductById(productId, productName = '') {
    const id = String(productId || '').trim();
    if (!id) return;
    const title = productName ? ` "${productName}"` : '';
    if (!confirm(`Удалить товар${title}? Это действие нельзя отменить.`)) return;

    try {
      await this.fetchJson('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', productIds: [id] })
      });
      this.showSuccess('Товар удален');
      await this.loadProducts();
    } catch (error) {
      this.showError(`Ошибка удаления: ${error.message}`);
    }
  }

  async toggleProductVisibility(productId, currentStatus = '', productName = '') {
    const id = String(productId || '').trim();
    if (!id) return;
    const normalizedStatus = String(currentStatus || '').trim().toLowerCase();
    const nextStatus = normalizedStatus === 'active' ? 'hidden' : 'active';
    const title = productName ? ` «${productName}»` : '';

    try {
      await this.fetchJson(`/api/admin/products/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      this.showSuccess(nextStatus === 'active' ? `Товар${title} опубликован` : `Товар${title} скрыт`);
      await this.loadProducts();
    } catch (error) {
      this.showError(`Ошибка изменения статуса: ${error.message}`);
    }
  }

  toggleFilters() {
    const content = document.querySelector('.filters-content');
    const btn = document.querySelector('.filters-header .btn.btn-link');
    if (!content || !btn) return;

    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? 'Свернуть' : 'Развернуть';
  }

  refreshQualityIndicator() {
    const holder = document.getElementById('qualityIndicator');
    if (!holder) return;
    const status = document.getElementById('productStatus')?.value || this.currentProduct?.status || 'active';
    const hasConflict = this.hasVariantConflict({ status }, this.currentVariants);
    const statusCode = String(status || '').toLowerCase();
    holder.className = 'quality-indicator inline';

    if (statusCode === 'draft') {
      holder.classList.add('state-draft');
      holder.textContent = 'Статус: Черновик';
      return;
    }
    if (statusCode === 'hidden') {
      holder.classList.add('state-hidden');
      holder.textContent = 'Статус: Скрыт';
      return;
    }
    if (statusCode === 'archived') {
      holder.classList.add('state-archived');
      holder.textContent = 'Статус: Архив';
      return;
    }
    if (hasConflict) {
      holder.classList.add('state-warning');
      holder.textContent = 'Статус: Опубликован (проверьте варианты)';
      return;
    }
    holder.classList.add('state-published');
    holder.textContent = 'Статус: Опубликован';
  }

  showSuccess(message) {
    alert(`✅ ${message}`);
  }

  showError(message) {
    alert(`⚠ ${message}`);
  }

  formatPrice(price) {
    if (price == null || price === '') return '-';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 2
    }).format(Number(price));
  }

  formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('ru-RU');
  }

  formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ru-RU');
  }

  debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }
}

function callApp(method, ...args) {
  if (!window.adminApp) {
    alert(`⚠ Админка еще не инициализирована (метод: ${method}). Обновите страницу.`);
    return;
  }
  if (typeof window.adminApp[method] !== 'function') {
    alert(`⚠ Метод недоступен: ${method}. Проверьте консоль.`);
    console.error('adminApp method is not a function:', method, window.adminApp);
    return;
  }
  return window.adminApp[method](...args);
}

document.addEventListener('DOMContentLoaded', () => {
  window.adminApp = new AdminApp();
  document.getElementById('addMediaRowBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    callApp('addMediaRow');
  });
  document.getElementById('saveMediaBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    callApp('saveMedia');
  });
});

window.applyFilters = () => callApp('applyFilters');
window.resetFilters = () => callApp('resetFilters');
window.logoutAdmin = () => callApp('logoutAdmin');
window.toggleSelectAll = () => callApp('toggleSelectAll');
window.toggleProductSelection = (id) => callApp('toggleProductSelection', id);
window.clearSelection = () => callApp('clearSelection');
window.applyBulkAction = () => callApp('applyBulkAction');
window.changeCategoriesViewMode = () => callApp('changeCategoriesViewMode');
window.resetOrdersFilters = () => callApp('resetOrdersFilters');
window.viewOrderDetails = (orderId) => callApp('viewOrderDetails', orderId);
window.updateOrderStatus = (orderId) => callApp('updateOrderStatus', orderId);
window.saveOrderModal = () => callApp('saveOrderModal');
window.addOrderModalDocumentRow = () => callApp('addOrderModalDocumentRow');
window.removeOrderModalDocumentRow = (index) => callApp('removeOrderModalDocumentRow', index);
window.createCategoryAttributeTemplate = () => callApp('createCategoryAttributeTemplate');
window.toggleTemplateRequired = (templateId, required) => callApp('toggleTemplateRequired', templateId, required);
window.deleteCategoryAttributeTemplate = (templateId) => callApp('deleteCategoryAttributeTemplate', templateId);
window.refreshAttributeEditor = () => callApp('refreshAttributeEditor');
window.syncAttributesFromRaw = () => callApp('syncAttributesFromRaw');
window.createBrand = () => callApp('createBrand');
window.createFunctionalCategory = () => callApp('createFunctionalCategory');
window.createBrandCategory = () => callApp('createBrandCategory');
window.editBrand = (id) => callApp('editBrand', id);
window.deleteBrand = (id) => callApp('deleteBrand', id);
window.editFunctionalCategory = (id) => callApp('editFunctionalCategory', id);
window.deleteFunctionalCategory = (id) => callApp('deleteFunctionalCategory', id);
window.editBrandCategory = (id) => callApp('editBrandCategory', id);
window.deleteBrandCategory = (id) => callApp('deleteBrandCategory', id);
window.editProduct = (id) => callApp('editProduct', id);
window.backToProducts = () => callApp('backToProducts');
window.saveProduct = () => callApp('saveProduct');
window.createProduct = () => callApp('createProduct');
window.importProducts = () => callApp('importProducts');
window.exportProducts = () => callApp('exportProducts');
window.previewProduct = () => callApp('previewProduct');
window.duplicateProduct = () => callApp('duplicateProduct');
window.archiveProduct = () => callApp('archiveProduct');
window.deleteProduct = () => callApp('deleteProduct');
window.goToPage = (page) => callApp('goToPage', page);
window.toggleFilters = () => callApp('toggleFilters');
window.openHeaderFilter = (key, event) => callApp('openHeaderFilter', key, event);
window.addVariantRow = () => callApp('addVariantRow');
window.saveVariantRow = (index) => callApp('saveVariantRow', index);
window.deleteVariantRow = (index) => callApp('deleteVariantRow', index);
window.addMediaRow = () => callApp('addMediaRow');
window.deleteMediaRow = (index) => callApp('deleteMediaRow', index);
window.saveMedia = () => callApp('saveMedia');
window.addDocumentRow = () => callApp('addDocumentRow');
window.deleteDocumentRow = (index) => callApp('deleteDocumentRow', index);
window.saveDocuments = () => callApp('saveDocuments');
window.addContentTab = () => callApp('addContentTab');
window.addContentBlock = () => callApp('addContentBlock');
window.removeContentBlock = (index) => callApp('removeContentBlock', index);
window.addTableRowToBlock = (blockIndex) => callApp('addTableRowToBlock', blockIndex);
window.removeTableRowFromBlock = (blockIndex, rowIndex) => callApp('removeTableRowFromBlock', blockIndex, rowIndex);
window.removeTableRowNode = (btn) => callApp('removeTableRowNode', btn);
window.saveContentTab = () => callApp('saveContentTab');
window.deleteContentTab = () => callApp('deleteContentTab');
window.closeModal = (modalId) => {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
  if (overlay) {
    const bulk = document.getElementById('bulkModal');
    const order = document.getElementById('orderModal');
    const anyOpen = (bulk && bulk.style.display !== 'none') || (order && order.style.display !== 'none');
    overlay.style.display = anyOpen ? 'flex' : 'none';
  }
};
