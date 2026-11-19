#![windows_subsystem = "windows"]

use eframe::egui;
use serde::{Deserialize, Serialize};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;

const API_BASE: &str = "https://chorizo.dpdns.org/api";
const APP_VERSION: &str = "1.0.5";
const ORANGE: egui::Color32 = egui::Color32::from_rgb(239, 108, 51);
const SURFACE: egui::Color32 = egui::Color32::from_rgb(24, 24, 30);
const SURFACE2: egui::Color32 = egui::Color32::from_rgb(34, 34, 42);
const TEXT_MUTED: egui::Color32 = egui::Color32::from_rgb(155, 163, 178);

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
struct User { id: i64, name: String, role: String, #[serde(rename="avatarUrl")] avatar_url: Option<String> }
impl User { fn is_supplier(&self) -> bool { self.role == "supplier" } }

#[derive(Clone, Debug, Default, Deserialize)]
struct Product { id: i64, name: String, description: Option<String>, #[serde(rename="priceCents")] price_cents: i64, #[serde(rename="costCents", default)] cost_cents: i64, category: String, #[serde(rename="imageUrl")] image_url: Option<String>, available: bool }

#[derive(Clone, Debug, Default, Deserialize)]
struct OrderItem { #[serde(rename="productId")] product_id: i64, name: String, #[serde(rename="priceCents")] price_cents: i64, qty: i64 }
#[derive(Clone, Debug, Default, Deserialize)]
struct OrderCustomer { name: Option<String>, id: Option<i64> }
#[derive(Clone, Debug, Default, Deserialize)]
struct Order { id: i64, status: String, #[serde(rename="totalCents")] total_cents: i64, #[serde(rename="createdAt")] created_at: Option<String>, items: Vec<OrderItem>, customer: Option<OrderCustomer>, phone: Option<String>, address: Option<String>, note: Option<String> }

#[derive(Clone, Debug, Default, Deserialize)]
struct FinanceSummary { #[serde(rename="revenueCents", default)] revenue_cents: i64, #[serde(rename="costCents", default)] cost_cents: i64, #[serde(rename="grossMarginCents", default)] gross_margin_cents: i64, #[serde(rename="expensesCents", default)] expenses_cents: i64, #[serde(rename="netCents", default)] net_cents: i64, orders: i64, units: i64, #[serde(rename="expenseCount", default)] expense_count: i64 }

#[derive(Clone, Debug, Default, Deserialize)]
struct Expense { id: i64, label: String, #[serde(rename="amountCents")] amount_cents: i64, date: Option<String> }

#[derive(Clone, Debug, Default, Deserialize)]
struct Category { id: i64, name: String, #[serde(rename="productsCount", default)] products_count: i64 }

#[derive(Clone, Debug, Default, Deserialize)]
struct Conversation { id: i64, customer: Option<OrderCustomer>, #[serde(rename="lastMessage")] last_message: Option<MsgPreview>, #[serde(rename="unreadCount", default)] unread_count: i64, #[serde(rename="updatedAt")] updated_at: Option<String> }
#[derive(Clone, Debug, Default, Deserialize)]
struct MsgPreview { body: Option<String>, #[serde(rename="createdAt")] created_at: Option<String> }
#[derive(Clone, Debug, Default, Deserialize)]
struct ChatMessage { id: i64, body: String, #[serde(rename="createdAt")] created_at: Option<String>, #[serde(rename="senderId")] sender_id: Option<i64> }

enum Screen { Login, Boutique, Cart, Orders, Profile, Admin, Finances, Chat }

enum Msg {
    LoginOk(User, String),
    LoginErr(String),
    Products(Vec<Product>),
    Orders(Vec<Order>),
    Summary(FinanceSummary),
    Expenses(Vec<Expense>),
    Categories(Vec<Category>),
    Conversations(Vec<Conversation>),
    Messages(i64, Vec<ChatMessage>),
    MessageSent,
    UpdateAvailable(String, String),
    Error(String),
    Notice(String),
}

struct ShopApp {
    screen: Screen,
    token: Option<String>,
    user: Option<User>,
    name_input: String,
    busy: bool,
    notice: Option<String>,
    products: Vec<Product>,
    search: String,
    category: Option<String>,
    cart: Vec<CartLine>,
    orders: Vec<Order>,
    admin_tab: usize,
    summary: Option<FinanceSummary>,
    expenses: Vec<Expense>,
    categories: Vec<Category>,
    conversations: Vec<Conversation>,
    chat_id: Option<i64>,
    chat_messages: Vec<ChatMessage>,
    chat_input: String,
    new_cat: String,
    new_exp_label: String,
    new_exp_amount: String,
    new_exp_date: String,
    new_prod_name: String,
    new_prod_price: String,
    new_prod_cost: String,
    new_prod_category: String,
    new_prod_desc: String,
    new_prod_available: bool,
    supplier_code: String,
    update_version: Option<String>,
    update_url: Option<String>,
    rx: Receiver<Msg>,
    tx: Sender<Msg>,
}

#[derive(Clone, Debug, Default)]
struct CartLine { product: Product, qty: i64 }

impl Default for ShopApp {
    fn default() -> Self {
        let (tx, rx) = channel();
        // Auto-update check
        let txu = tx.clone();
        thread::spawn(move || {
            #[derive(Deserialize)] struct Asset { name: String, browser_download_url: String }
            #[derive(Deserialize)] struct Rel { tag_name: String, assets: Vec<Asset> }
            let url = "https://api.github.com/repos/tear360/ShopTaBouffe/releases/latest";
            if let Ok(r) = reqwest::blocking::Client::new().get(url).header("User-Agent", "ShopTaBouffe").send() {
                if r.status().is_success() {
                    if let Ok(rel) = r.json::<Rel>() {
                        let ver = rel.tag_name.trim_start_matches('v').to_string();
                        if ver != APP_VERSION {
                            if let Some(a) = rel.assets.into_iter().find(|a| a.name.ends_with(".exe")) {
                                let _ = txu.send(Msg::UpdateAvailable(ver, a.browser_download_url));
                            }
                        }
                    }
                }
            }
        });
        Self {
            screen: Screen::Login, token: None, user: None,
            name_input: String::new(), busy: false, notice: None,
            products: vec![], search: String::new(), category: None, cart: vec![], orders: vec![],
            admin_tab: 0, summary: None, expenses: vec![], categories: vec![], conversations: vec![],
            chat_id: None, chat_messages: vec![], chat_input: String::new(),
            new_cat: String::new(), new_exp_label: String::new(), new_exp_amount: String::new(), new_exp_date: String::new(),
            new_prod_name: String::new(), new_prod_price: String::new(), new_prod_cost: String::new(), new_prod_category: String::new(), new_prod_desc: String::new(), new_prod_available: true,
            supplier_code: String::new(),
            update_version: None, update_url: None,
            rx, tx,
        }
    }
}

// ---------- HTTP helpers ----------

fn fetch_products(tx: Sender<Msg>, token: Option<String>) {
    thread::spawn(move || {
        let url = format!("{}/products", API_BASE);
        let mut req = reqwest::blocking::Client::new().get(&url);
        if let Some(t) = token { req = req.bearer_auth(t); }
        match req.send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)] struct R { products: Vec<Product> }
                if let Ok(v) = r.json::<R>() { let _ = tx.send(Msg::Products(v.products)); }
            }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn fetch_orders(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        let url = format!("{}/orders", API_BASE);
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)] struct R { orders: Vec<Order> }
                if let Ok(v) = r.json::<R>() { let _ = tx.send(Msg::Orders(v.orders)); }
            }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn fetch_summary(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        let url = format!("{}/finances/summary", API_BASE);
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                if let Ok(v) = r.json::<FinanceSummary>() { let _ = tx.send(Msg::Summary(v)); }
            }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn fetch_expenses(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        let url = format!("{}/finances/expenses", API_BASE);
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)] struct R { expenses: Vec<Expense> }
                if let Ok(v) = r.json::<R>() { let _ = tx.send(Msg::Expenses(v.expenses)); }
            }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn fetch_categories(tx: Sender<Msg>, token: Option<String>) {
    thread::spawn(move || {
        let url = format!("{}/categories", API_BASE);
        let mut req = reqwest::blocking::Client::new().get(&url);
        if let Some(t) = token { req = req.bearer_auth(t); }
        match req.send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)] struct R { categories: Vec<Category> }
                if let Ok(v) = r.json::<R>() { let _ = tx.send(Msg::Categories(v.categories)); }
            }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn fetch_conversations(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        let url = format!("{}/conversations", API_BASE);
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)] struct R { conversations: Vec<Conversation> }
                if let Ok(v) = r.json::<R>() { let _ = tx.send(Msg::Conversations(v.conversations)); }
            }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn fetch_messages(tx: Sender<Msg>, token: String, conv_id: i64) {
    thread::spawn(move || {
        let url = format!("{}/conversations/{}/messages", API_BASE, conv_id);
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)] struct R { messages: Vec<ChatMessage> }
                if let Ok(v) = r.json::<R>() { let _ = tx.send(Msg::Messages(conv_id, v.messages)); }
            }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn send_message(tx: Sender<Msg>, token: String, conv_id: i64, body: String) {
    thread::spawn(move || {
        #[derive(Serialize)] struct B { body: String }
        let url = format!("{}/conversations/{}/messages", API_BASE, conv_id);
        match reqwest::blocking::Client::new().post(&url).bearer_auth(&token).json(&B { body }).send() {
            Ok(r) if r.status().is_success() => { let _ = tx.send(Msg::MessageSent); }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn demo_login(tx: Sender<Msg>, name: String) {
    thread::spawn(move || {
        #[derive(Serialize)] struct B { name: String }
        #[derive(Deserialize)] struct R { token: String, user: User }
        let url = format!("{}/auth/demo", API_BASE);
        match reqwest::blocking::Client::new().post(&url).json(&B { name }).send() {
            Ok(r) if r.status().is_success() => {
                if let Ok(v) = r.json::<R>() { let _ = tx.send(Msg::LoginOk(v.user, v.token)); }
            }
            Ok(r) => { let _ = tx.send(Msg::LoginErr(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::LoginErr(e.to_string())); }
        }
    });
}

fn enter_supplier(tx: Sender<Msg>, token: String, code: String) {
    thread::spawn(move || {
        #[derive(Serialize)] struct B { code: String }
        #[derive(Deserialize)] struct R { user: User }
        let url = format!("{}/admin/enter", API_BASE);
        match reqwest::blocking::Client::new().post(&url).bearer_auth(&token).json(&B { code }).send() {
            Ok(r) if r.status().is_success() => {
                if let Ok(v) = r.json::<R>() { let _ = tx.send(Msg::LoginOk(v.user, token)); }
            }
            Ok(r) => { let _ = tx.send(Msg::LoginErr(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::LoginErr(e.to_string())); }
        }
    });
}

fn create_category(tx: Sender<Msg>, token: String, name: String) {
    thread::spawn(move || {
        #[derive(Serialize)] struct B { name: String }
        let url = format!("{}/categories", API_BASE);
        match reqwest::blocking::Client::new().post(&url).bearer_auth(&token).json(&B { name }).send() {
            Ok(r) if r.status().is_success() => { let _ = tx.send(Msg::Notice("Catégorie ajoutée".into())); fetch_categories(tx.clone(), Some(token)); }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn rename_category(tx: Sender<Msg>, token: String, id: i64, name: String) {
    thread::spawn(move || {
        #[derive(Serialize)] struct B { name: String }
        let url = format!("{}/categories/{}", API_BASE, id);
        match reqwest::blocking::Client::new().patch(&url).bearer_auth(&token).json(&B { name }).send() {
            Ok(r) if r.status().is_success() => { let _ = tx.send(Msg::Notice("Catégorie renommée".into())); fetch_categories(tx.clone(), Some(token)); }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn delete_category(tx: Sender<Msg>, token: String, id: i64) {
    thread::spawn(move || {
        let url = format!("{}/categories/{}", API_BASE, id);
        match reqwest::blocking::Client::new().delete(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => { let _ = tx.send(Msg::Notice("Catégorie supprimée".into())); fetch_categories(tx.clone(), Some(token)); }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn create_expense(tx: Sender<Msg>, token: String, label: String, amount_cents: i64, date: Option<String>) {
    thread::spawn(move || {
        #[derive(Serialize)] struct B { label: String, #[serde(rename="amountCents")] amount_cents: i64, date: Option<String> }
        let url = format!("{}/finances/expenses", API_BASE);
        match reqwest::blocking::Client::new().post(&url).bearer_auth(&token).json(&B { label, amount_cents, date }).send() {
            Ok(r) if r.status().is_success() => { let _ = tx.send(Msg::Notice("Dépense ajoutée".into())); fetch_expenses(tx.clone(), token); }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn delete_expense(tx: Sender<Msg>, token: String, id: i64) {
    thread::spawn(move || {
        let url = format!("{}/finances/expenses/{}", API_BASE, id);
        match reqwest::blocking::Client::new().delete(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => { let _ = tx.send(Msg::Notice("Dépense supprimée".into())); fetch_expenses(tx.clone(), token); }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn create_product(tx: Sender<Msg>, token: String, name: String, desc: Option<String>, price_cents: i64, cost_cents: i64, category: String, available: bool) {
    thread::spawn(move || {
        #[derive(Serialize)] struct B { name: String, description: Option<String>, #[serde(rename="priceCents")] price_cents: i64, #[serde(rename="costCents")] cost_cents: i64, category: String, #[serde(rename="imageUrl")] image_url: Option<String>, available: bool }
        let url = format!("{}/products", API_BASE);
        let body = B { name, description: desc, price_cents, cost_cents, category, image_url: None, available };
        match reqwest::blocking::Client::new().post(&url).bearer_auth(&token).json(&body).send() {
            Ok(r) if r.status().is_success() => { let _ = tx.send(Msg::Notice("Produit ajouté".into())); fetch_products(tx.clone(), Some(token)); }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

fn delete_product(tx: Sender<Msg>, token: String, id: i64) {
    thread::spawn(move || {
        let url = format!("{}/products/{}", API_BASE, id);
        match reqwest::blocking::Client::new().delete(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => { let _ = tx.send(Msg::Notice("Produit supprimé".into())); fetch_products(tx.clone(), Some(token)); }
            Ok(r) => { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

// ---------- UI helpers ----------

fn card(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui)) {
    egui::Frame::new()
        .fill(SURFACE)
        .stroke(egui::Stroke::new(1.0, egui::Color32::from_rgb(45, 45, 55)))
        .corner_radius(egui::CornerRadius::same(12))
        .inner_margin(egui::Margin::same(12))
        .show(ui, |ui| add(ui));
}

fn section_title(ui: &mut egui::Ui, text: &str) {
    ui.add_space(4.0);
    ui.label(egui::RichText::new(text).size(15.0).strong().color(egui::Color32::WHITE));
    ui.add_space(4.0);
}

fn empty_state(ui: &mut egui::Ui, icon: &str, title: &str, msg: &str) {
    ui.vertical_centered(|ui| {
        ui.add_space(40.0);
        ui.label(egui::RichText::new(icon).size(48.0));
        ui.add_space(8.0);
        ui.label(egui::RichText::new(title).size(16.0).strong());
        ui.label(egui::RichText::new(msg).size(13.0).color(TEXT_MUTED));
        ui.add_space(40.0);
    });
}

fn cents(c: i64) -> String { format!("{}.{:02} €", c / 100, (c % 100).abs()) }

impl eframe::App for ShopApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        while let Ok(m) = self.rx.try_recv() {
            match m {
                Msg::LoginOk(u, t) => { self.user = Some(u); self.token = Some(t); self.busy = false; self.screen = Screen::Boutique; self.notice = Some("Connecté".into()); fetch_products(self.tx.clone(), self.token.clone()); fetch_categories(self.tx.clone(), self.token.clone()); }
                Msg::LoginErr(e) => { self.busy = false; self.notice = Some(e); }
                Msg::Products(p) => { self.products = p; }
                Msg::Orders(o) => { self.orders = o; }
                Msg::Summary(s) => { self.summary = Some(s); }
                Msg::Expenses(e) => { self.expenses = e; }
                Msg::Categories(c) => { self.categories = c; }
                Msg::Conversations(c) => { self.conversations = c; }
                Msg::Messages(id, m) => { if self.chat_id == Some(id) { self.chat_messages = m; } }
                Msg::MessageSent => { if let Some(id) = self.chat_id { if let Some(t) = self.token.clone() { fetch_messages(self.tx.clone(), t, id); } } }
                Msg::UpdateAvailable(v, u) => { self.update_version = Some(v); self.update_url = Some(u); }
                Msg::Notice(n) => { self.notice = Some(n); }
                Msg::Error(e) => { self.notice = Some(e); self.busy = false; }
            }
        }

        // Top bar
        egui::TopBottomPanel::top("top").show(ctx, |ui| {
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new("🛍️ ShopTaBouffe").size(18.0).strong().color(ORANGE));
                if let Some(u) = &self.user {
                    ui.label(egui::RichText::new(format!("  ·  {}", u.name)).color(TEXT_MUTED));
                    if u.is_supplier() { ui.label(egui::RichText::new(" (fournisseur)").color(TEXT_MUTED).size(12.0)); }
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if self.user.is_some() && ui.button("Déconnexion").clicked() {
                        self.user = None; self.token = None; self.screen = Screen::Login;
                    }
                });
            });
            // Auto-update banner
            if let (Some(v), Some(u)) = (self.update_version.clone(), self.update_url.clone()) {
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new(format!("Mise à jour disponible : v{}", v)).color(ORANGE).strong());
                    if ui.button("Télécharger et installer").clicked() {
                        let url = u.clone();
                        let tx = self.tx.clone();
                        thread::spawn(move || {
                            let path = std::env::temp_dir().join("ShopTaBouffe-Update.exe");
                            if let Ok(r) = reqwest::blocking::Client::new().get(&url).send() {
                                if let Ok(bytes) = r.bytes() {
                                    if std::fs::write(&path, &bytes).is_ok() {
                                        let _ = std::process::Command::new(&path).spawn();
                                        let _ = tx.send(Msg::Notice("Mise à jour lancée".into()));
                                    }
                                }
                            }
                        });
                    }
                });
            }
            if self.user.is_some() {
                ui.add_space(2.0);
                ui.horizontal(|ui| {
                    let mut tabs: Vec<(&str, Screen)> = vec![("Boutique", Screen::Boutique), ("Panier", Screen::Cart), ("Commandes", Screen::Orders), ("Profil", Screen::Profile)];
                    if self.user.as_ref().unwrap().is_supplier() {
                        tabs.push(("Produits", Screen::Admin));
                        tabs.push(("Finances", Screen::Finances));
                        tabs.push(("Messages", Screen::Chat));
                    } else {
                        tabs.push(("Messages", Screen::Chat));
                    }
                    for (label, scr) in tabs {
                        let selected = std::mem::discriminant(&self.screen) == std::mem::discriminant(&scr);
                        if ui.selectable_label(selected, label).clicked() { self.screen = scr; }
                    }
                });
                ui.add_space(4.0);
            }
        });

        if let Some(n) = self.notice.clone() {
            egui::TopBottomPanel::bottom("notice").show(ctx, |ui| {
                ui.add_space(4.0);
                ui.label(egui::RichText::new(n).color(ORANGE));
                ui.add_space(4.0);
            });
            self.notice = None;
        }

        egui::CentralPanel::default().show(ctx, |ui| {
            match self.screen {
                Screen::Login => self.ui_login(ui),
                Screen::Boutique => self.ui_boutique(ui),
                Screen::Cart => self.ui_cart(ui),
                Screen::Orders => self.ui_orders(ui),
                Screen::Profile => self.ui_profile(ui),
                Screen::Admin => self.ui_admin(ui),
                Screen::Finances => self.ui_finances(ui),
                Screen::Chat => self.ui_chat(ui),
            }
        });
    }
}

impl ShopApp {
    fn ui_login(&mut self, ui: &mut egui::Ui) {
        ui.vertical_centered(|ui| {
            ui.add_space(60.0);
            ui.label(egui::RichText::new("🛍️").size(56.0));
            ui.add_space(8.0);
            ui.label(egui::RichText::new("ShopTaBouffe").size(28.0).strong().color(ORANGE));
            ui.label(egui::RichText::new("Commandez chez vos commerçants locaux").color(TEXT_MUTED));
            ui.add_space(30.0);
            card(ui, |ui| {
                ui.label(egui::RichText::new("Votre nom").strong());
                ui.text_edit_singleline(&mut self.name_input);
                ui.add_space(8.0);
                if ui.button("Se connecter avec ce nom").clicked() && !self.name_input.trim().is_empty() {
                    self.busy = true;
                    demo_login(self.tx.clone(), self.name_input.trim().to_string());
                }
            });
            ui.add_space(16.0);
            ui.label(egui::RichText::new("ou continuer avec").color(TEXT_MUTED));
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                if ui.button("Continuer avec Google").clicked() {
                    let _ = open::that("https://chorizo.dpdns.org/api/auth/start?provider=google&target=web");
                }
                if ui.button("Continuer avec GitHub").clicked() {
                    let _ = open::that("https://chorizo.dpdns.org/api/auth/start?provider=github&target=web");
                }
            });
        });
    }

    fn ui_boutique(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            ui.label("🔍");
            ui.text_edit_singleline(&mut self.search);
            if ui.button("↻").clicked() { fetch_products(self.tx.clone(), self.token.clone()); }
        });
        let cats: Vec<String> = {
            let mut s: std::collections::BTreeSet<String> = self.products.iter().map(|p| p.category.clone()).collect();
            s.into_iter().collect()
        };
        ui.horizontal_wrapped(|ui| {
            if ui.selectable_label(self.category.is_none(), "Tout").clicked() { self.category = None; }
            for c in &cats {
                let sel = self.category.as_deref() == Some(c.as_str());
                if ui.selectable_label(sel, c).clicked() { self.category = Some(c.clone()); }
            }
        });
        ui.separator();
        egui::ScrollArea::vertical().show(ui, |ui| {
            let search = self.search.to_lowercase();
            let cat = self.category.clone();
            let mut to_add: Option<i64> = None;
            let mut count = 0;
            for p in &self.products {
                if !search.is_empty() && !p.name.to_lowercase().contains(&search) { continue; }
                if let Some(c) = &cat { if p.category != *c { continue; } }
                count += 1;
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        // image placeholder
                        let (rect, _) = ui.allocate_exact_size(egui::vec2(54.0, 54.0), egui::Sense::hover());
                        ui.painter().rect_filled(rect, 8.0, SURFACE2);
                        ui.painter().text(rect.center(), egui::Align2::CENTER_CENTER, "🍽️", egui::FontId::proportional(24.0), TEXT_MUTED);
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(&p.name).strong());
                            ui.label(egui::RichText::new(format!("{} · {}", p.category, cents(p.price_cents))).color(TEXT_MUTED).size(12.0));
                            if !p.available {
                                ui.label(egui::RichText::new("Indisponible").color(egui::Color32::from_rgb(220, 80, 80)).size(11.0));
                            }
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if p.available && ui.button("+").clicked() { to_add = Some(p.id); }
                        });
                    });
                });
                ui.add_space(6.0);
            }
            if count == 0 { empty_state(ui, "🛒", "Aucun produit", "Aucun produit ne correspond."); }
            if let Some(id) = to_add {
                if let Some(p) = self.products.iter().find(|x| x.id == id).cloned() {
                    if let Some(line) = self.cart.iter_mut().find(|l| l.product.id == id) { line.qty += 1; }
                    else { self.cart.push(CartLine { product: p, qty: 1 }); }
                }
            }
        });
    }

    fn ui_cart(&mut self, ui: &mut egui::Ui) {
        if self.cart.is_empty() { empty_state(ui, "🛒", "Panier vide", "Ajoutez des produits depuis la boutique."); return; }
        let mut total: i64 = 0;
        let mut remove: Option<usize> = None;
        egui::ScrollArea::vertical().show(ui, |ui| {
            for (i, line) in self.cart.iter_mut().enumerate() {
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(&line.product.name).strong());
                            ui.label(egui::RichText::new(cents(line.product.price_cents)).color(TEXT_MUTED).size(12.0));
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(egui::RichText::new(cents(line.product.price_cents * line.qty)).strong());
                            if ui.button("🗑").clicked() { remove = Some(i); }
                            if ui.button("+").clicked() { line.qty += 1; }
                            ui.label(format!("{}", line.qty));
                            if ui.button("−").clicked() && line.qty > 1 { line.qty -= 1; }
                        });
                    });
                });
                ui.add_space(6.0);
                total += line.product.price_cents * line.qty;
            }
        });
        if let Some(i) = remove { self.cart.remove(i); }
        ui.add_space(8.0);
        card(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new("Total").strong());
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(egui::RichText::new(cents(total)).size(18.0).strong().color(ORANGE));
                });
            });
        });
        ui.add_space(8.0);
        if ui.button("Passer la commande").clicked() {
            self.notice = Some("Commande (API à brancher)".into());
        }
    }

    fn ui_orders(&mut self, ui: &mut egui::Ui) {
        if ui.button("↻ Rafraîchir").clicked() { if let Some(t) = self.token.clone() { fetch_orders(self.tx.clone(), t); } }
        ui.add_space(4.0);
        if self.orders.is_empty() { empty_state(ui, "📋", "Aucune commande", "Les nouvelles commandes apparaîtront ici."); return; }
        egui::ScrollArea::vertical().show(ui, |ui| {
            for o in &self.orders {
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new(format!("#{}", o.id)).strong());
                        ui.label(egui::RichText::new(&o.status).color(status_color(&o.status)));
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(egui::RichText::new(cents(o.total_cents)).strong().color(ORANGE));
                        });
                    });
                    if let Some(c) = &o.customer { ui.label(egui::RichText::new(c.name.clone().unwrap_or_default()).color(TEXT_MUTED).size(12.0)); }
                    ui.label(o.items.iter().map(|i| format!("{}× {}", i.qty, i.name)).collect::<Vec<_>>().join(", "));
                    if let Some(n) = &o.note { ui.label(egui::RichText::new(format!("📝 {}", n)).color(TEXT_MUTED).size(12.0)); }
                });
                ui.add_space(6.0);
            }
        });
    }

    fn ui_profile(&mut self, ui: &mut egui::Ui) {
        if let Some(u) = &self.user {
            card(ui, |ui| {
                ui.label(egui::RichText::new(&u.name).size(18.0).strong());
                ui.label(egui::RichText::new(format!("Rôle : {}", u.role)).color(TEXT_MUTED));
            });
            ui.add_space(8.0);
            if !u.is_supplier() {
                card(ui, |ui| {
                    ui.label(egui::RichText::new("Devenir fournisseur").strong());
                    ui.label(egui::RichText::new("Entrez votre code d'accès").color(TEXT_MUTED).size(12.0));
                    ui.text_edit_singleline(&mut self.supplier_code);
                    if ui.button("Valider").clicked() && !self.supplier_code.trim().is_empty() {
                        if let Some(t) = self.token.clone() {
                            enter_supplier(self.tx.clone(), t, self.supplier_code.clone());
                        }
                    }
                });
            }
        }
    }

    fn ui_admin(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            for (i, label) in ["Commandes", "Produits", "Catégories"].iter().enumerate() {
                if ui.selectable_label(self.admin_tab == i, *label).clicked() { self.admin_tab = i; }
            }
        });
        ui.separator();
        match self.admin_tab {
            0 => {
                if ui.button("↻ Rafraîchir").clicked() { if let Some(t)=self.token.clone(){fetch_orders(self.tx.clone(),t);} }
                ui.add_space(4.0);
                if self.orders.is_empty() { empty_state(ui, "📋", "Aucune commande", "Les nouvelles commandes apparaîtront ici."); return; }
                egui::ScrollArea::vertical().show(ui, |ui| {
                    for o in &self.orders {
                        card(ui, |ui| {
                            ui.horizontal(|ui| {
                                ui.label(egui::RichText::new(format!("#{}", o.id)).strong());
                                ui.label(egui::RichText::new(&o.status).color(status_color(&o.status)));
                                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                    ui.label(egui::RichText::new(cents(o.total_cents)).strong().color(ORANGE));
                                });
                            });
                            if let Some(c) = &o.customer { ui.label(egui::RichText::new(c.name.clone().unwrap_or_default()).color(TEXT_MUTED).size(12.0)); }
                            ui.label(o.items.iter().map(|i| format!("{}× {}", i.qty, i.name)).collect::<Vec<_>>().join(", "));
                        });
                        ui.add_space(6.0);
                    }
                });
            }
            1 => {
                card(ui, |ui| {
                    ui.label(egui::RichText::new("Nouveau produit").strong());
                    ui.text_edit_singleline(&mut self.new_prod_name);
                    ui.horizontal(|ui| { ui.label("Prix"); ui.text_edit_singleline(&mut self.new_prod_price); ui.label("Coût"); ui.text_edit_singleline(&mut self.new_prod_cost); });
                    ui.text_edit_singleline(&mut self.new_prod_category);
                    ui.checkbox(&mut self.new_prod_available, "Disponible");
                    if ui.button("Ajouter").clicked() {
                        let price = self.new_prod_price.replace(',',".").parse::<f64>().unwrap_or(0.0);
                        let cost = self.new_prod_cost.replace(',',".").parse::<f64>().unwrap_or(0.0);
                        if let Some(t) = self.token.clone() {
                            create_product(self.tx.clone(), t, self.new_prod_name.clone(), if self.new_prod_desc.is_empty(){None}else{Some(self.new_prod_desc.clone())}, (price*100.0) as i64, (cost*100.0) as i64, self.new_prod_category.clone(), self.new_prod_available);
                        }
                    }
                });
                ui.add_space(6.0);
                if ui.button("↻ Rafraîchir").clicked() { fetch_products(self.tx.clone(), self.token.clone()); }
                egui::ScrollArea::vertical().show(ui, |ui| {
                    for p in &self.products {
                        card(ui, |ui| {
                            ui.horizontal(|ui| {
                                ui.vertical(|ui| {
                                    ui.label(egui::RichText::new(&p.name).strong());
                                    ui.label(egui::RichText::new(format!("{} · {}", p.category, cents(p.price_cents))).color(TEXT_MUTED).size(12.0));
                                    if !p.available { ui.label(egui::RichText::new("Indisponible").color(egui::Color32::from_rgb(220,80,80)).size(11.0)); }
                                });
                                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                    if ui.button("🗑").clicked() { if let Some(t)=self.token.clone(){delete_product(self.tx.clone(),t,p.id);} }
                                });
                            });
                        });
                        ui.add_space(6.0);
                    }
                });
            }
            _ => {
                card(ui, |ui| {
                    ui.label(egui::RichText::new("Nouvelle catégorie").strong());
                    ui.horizontal(|ui| {
                        ui.text_edit_singleline(&mut self.new_cat);
                        if ui.button("Ajouter").clicked() && !self.new_cat.trim().is_empty() {
                            if let Some(t)=self.token.clone(){ create_category(self.tx.clone(),t,self.new_cat.clone()); self.new_cat.clear(); }
                        }
                    });
                });
                ui.add_space(6.0);
                if ui.button("↻ Rafraîchir").clicked() { fetch_categories(self.tx.clone(), self.token.clone()); }
                egui::ScrollArea::vertical().show(ui, |ui| {
                    for c in &self.categories {
                        card(ui, |ui| {
                            ui.horizontal(|ui| {
                                ui.label(egui::RichText::new(&c.name).strong());
                                ui.label(egui::RichText::new(format!("{} produit(s)", c.products_count)).color(TEXT_MUTED).size(12.0));
                                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                    if ui.button("🗑").clicked() { if let Some(t)=self.token.clone(){delete_category(self.tx.clone(),t,c.id);} }
                                });
                            });
                        });
                        ui.add_space(6.0);
                    }
                });
            }
        }
    }

    fn ui_finances(&mut self, ui: &mut egui::Ui) {
        if ui.button("↻ Rafraîchir").clicked() { if let Some(t)=self.token.clone(){fetch_summary(self.tx.clone(),t.clone()); fetch_expenses(self.tx.clone(),t);} }
        ui.add_space(4.0);
        if let Some(s) = &self.summary {
            ui.horizontal_wrapped(|ui| {
                for (label, val, sub) in [("Revenus", s.revenue_cents, format!("{} commande(s)", s.orders)),
                    ("Coûts", s.cost_cents, format!("{} unité(s)", s.units)),
                    ("Marge", s.gross_margin_cents, "Revenus − coûts".into()),
                    ("Dépenses", s.expenses_cents, format!("{} ligne(s)", s.expense_count)),
                    ("Net", s.net_cents, "Marge − dépenses".into())] {
                    card(ui, |ui| {
                        ui.label(egui::RichText::new(label).size(11.0).color(TEXT_MUTED));
                        ui.label(egui::RichText::new(cents(val)).size(16.0).strong().color(if label=="Net" { ORANGE } else { egui::Color32::WHITE }));
                        ui.label(egui::RichText::new(sub).size(10.0).color(TEXT_MUTED));
                    });
                }
            });
        }
        ui.add_space(8.0);
        section_title(ui, "Nouvelle dépense");
        card(ui, |ui| {
            ui.horizontal(|ui| { ui.label("Libellé"); ui.text_edit_singleline(&mut self.new_exp_label); });
            ui.horizontal(|ui| { ui.label("Montant"); ui.text_edit_singleline(&mut self.new_exp_amount); ui.label("Date"); ui.text_edit_singleline(&mut self.new_exp_date); });
            if ui.button("Ajouter").clicked() && !self.new_exp_label.trim().is_empty() {
                let amt = self.new_exp_amount.replace(',',".").parse::<f64>().unwrap_or(0.0);
                if let Some(t) = self.token.clone() {
                    create_expense(self.tx.clone(), t, self.new_exp_label.clone(), (amt*100.0) as i64, if self.new_exp_date.is_empty(){None}else{Some(self.new_exp_date.clone())});
                    self.new_exp_label.clear(); self.new_exp_amount.clear(); self.new_exp_date.clear();
                }
            }
        });
        ui.add_space(8.0);
        section_title(ui, "Dépenses");
        if self.expenses.is_empty() { empty_state(ui, "💳", "Aucune dépense", "Ajoutez vos charges pour calculer le résultat net."); return; }
        egui::ScrollArea::vertical().show(ui, |ui| {
            for e in &self.expenses {
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(&e.label).strong());
                            ui.label(egui::RichText::new(e.date.clone().unwrap_or_default()).color(TEXT_MUTED).size(11.0));
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(egui::RichText::new(cents(e.amount_cents)).color(egui::Color32::from_rgb(220,80,80)).strong());
                            if ui.button("🗑").clicked() { if let Some(t)=self.token.clone(){delete_expense(self.tx.clone(),t,e.id);} }
                        });
                    });
                });
                ui.add_space(6.0);
            }
        });
    }

    fn ui_chat(&mut self, ui: &mut egui::Ui) {
        if self.conversations.is_empty() && ui.button("Charger").clicked() { if let Some(t)=self.token.clone(){fetch_conversations(self.tx.clone(),t);} }
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.label(egui::RichText::new("Conversations").strong());
                egui::ScrollArea::vertical().max_height(600.0).show(ui, |ui| {
                    for c in &self.conversations {
                        let sel = self.chat_id == Some(c.id);
                        let name = c.customer.as_ref().and_then(|x| x.name.clone()).unwrap_or_else(|| format!("#{}", c.id));
                        if ui.selectable_label(sel, name).clicked() {
                            self.chat_id = Some(c.id);
                            if let Some(t) = self.token.clone() { fetch_messages(self.tx.clone(), t, c.id); }
                        }
                    }
                });
            });
            ui.separator();
            ui.vertical(|ui| {
                if let Some(id) = self.chat_id {
                    ui.label(egui::RichText::new(format!("Conversation #{}", id)).strong());
                    egui::ScrollArea::vertical().max_height(500.0).show(ui, |ui| {
                        for m in &self.chat_messages {
                            card(ui, |ui| { ui.label(&m.body); });
                            ui.add_space(4.0);
                        }
                    });
                    ui.horizontal(|ui| {
                        ui.text_edit_singleline(&mut self.chat_input);
                        if ui.button("Envoyer").clicked() && !self.chat_input.trim().is_empty() {
                            if let Some(t) = self.token.clone() {
                                send_message(self.tx.clone(), t, id, self.chat_input.clone());
                                self.chat_input.clear();
                            }
                        }
                    });
                } else {
                    empty_state(ui, "💬", "Aucune conversation", "Sélectionnez une conversation à gauche.");
                }
            });
        });
    }
}

fn status_color(s: &str) -> egui::Color32 {
    match s {
        "pending" => egui::Color32::from_rgb(250, 204, 21),
        "accepted" | "preparing" => egui::Color32::from_rgb(96, 165, 250),
        "delivering" => egui::Color32::from_rgb(167, 139, 250),
        "delivered" => egui::Color32::from_rgb(52, 211, 153),
        "refused" => egui::Color32::from_rgb(248, 113, 113),
        _ => TEXT_MUTED,
    }
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([1240.0, 820.0]),
        ..Default::default()
    };
    eframe::run_native("ShopTaBouffe", options, Box::new(|cc| {
        let mut style = (*cc.egui_ctx.style()).clone();
        style.visuals = egui::Visuals::dark();
        style.visuals.widgets.noninteractive.bg_fill = SURFACE;
        style.visuals.widgets.inactive.bg_fill = SURFACE2;
        style.visuals.widgets.hovered.bg_fill = egui::Color32::from_rgb(55, 55, 65);
        style.visuals.widgets.active.bg_fill = ORANGE;
        style.visuals.selection.bg_fill = ORANGE;
        style.visuals.hyperlink_color = ORANGE;
        style.visuals.window_fill = egui::Color32::from_rgb(14, 14, 18);
        style.spacing.item_spacing = egui::vec2(8.0, 6.0);
        style.spacing.button_padding = egui::vec2(12.0, 6.0);
        cc.egui_ctx.set_style(style);
        Ok(Box::new(ShopApp::default()))
    }))
}
