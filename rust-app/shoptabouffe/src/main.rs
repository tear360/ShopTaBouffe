#![windows_subsystem = "windows"]

use eframe::egui;
use serde::{Deserialize, Serialize};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;

const API_BASE: &str = "https://chorizo.dpdns.org/api";

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
    Error(String),
    Notice(String),
}

struct ShopApp {
    screen: Screen,
    token: Option<String>,
    user: Option<User>,
    name_input: String,
    token_paste: String,
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
    // forms
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
    // async
    rx: Receiver<Msg>,
    tx: Sender<Msg>,
}

#[derive(Clone, Debug, Default)]
struct CartLine { product: Product, qty: i64 }

impl Default for ShopApp {
    fn default() -> Self {
        let (tx, rx) = channel();
        Self {
            screen: Screen::Login, token: None, user: None,
            name_input: String::new(), token_paste: String::new(), busy: false, notice: None,
            products: vec![], search: String::new(), category: None, cart: vec![], orders: vec![],
            admin_tab: 0, summary: None, expenses: vec![], categories: vec![], conversations: vec![],
            chat_id: None, chat_messages: vec![], chat_input: String::new(),
            new_cat: String::new(), new_exp_label: String::new(), new_exp_amount: String::new(), new_exp_date: String::new(),
            new_prod_name: String::new(), new_prod_price: String::new(), new_prod_cost: String::new(), new_prod_category: String::new(), new_prod_desc: String::new(), new_prod_available: true,
            supplier_code: String::new(),
            rx, tx,
        }
    }
}

// ---------- HTTP helpers ----------

fn bearer(token: &Option<String>) -> Option<String> { token.clone() }

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
                Msg::MessageSent => { if let Some(id) = self.chat_id { fetch_messages(self.tx.clone(), self.token.clone().unwrap_or_default(), id); } }
                Msg::Notice(n) => { self.notice = Some(n); }
                Msg::Error(e) => { self.notice = Some(e); self.busy = false; }
            }
        }

        egui::TopBottomPanel::top("top").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading("ShopTaBouffe");
                if let Some(u) = &self.user {
                    ui.label(format!("· {}", u.name));
                    if u.is_supplier() { ui.label("(fournisseur)"); }
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if self.user.is_some() && ui.button("Déconnexion").clicked() {
                        self.user = None; self.token = None; self.screen = Screen::Login;
                    }
                });
            });
            if self.user.is_some() {
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
            }
        });

        if let Some(n) = self.notice.clone() {
            egui::TopBottomPanel::bottom("notice").show(ctx, |ui| { ui.label(n); });
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
            ui.heading("Connexion");
            ui.add_space(10.0);
            ui.label("Votre nom");
            ui.text_edit_singleline(&mut self.name_input);
            if ui.button("Se connecter avec ce nom").clicked() && !self.name_input.trim().is_empty() {
                self.busy = true;
                demo_login(self.tx.clone(), self.name_input.trim().to_string());
            }
            ui.add_space(10.0);
            ui.label("ou continuer avec");
            if ui.button("Continuer avec Google").clicked() {
                let _ = open::that("https://chorizo.dpdns.org/api/auth/start?provider=google&target=web");
            }
            if ui.button("Continuer avec GitHub").clicked() {
                let _ = open::that("https://chorizo.dpdns.org/api/auth/start?provider=github&target=web");
            }
        });
    }

    fn ui_boutique(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| { ui.label("Rechercher"); ui.text_edit_singleline(&mut self.search); });
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
        if ui.button("Rafraîchir").clicked() { fetch_products(self.tx.clone(), self.token.clone()); }
        ui.separator();
        egui::ScrollArea::vertical().show(ui, |ui| {
            let search = self.search.to_lowercase();
            let cat = self.category.clone();
            let mut to_add: Option<i64> = None;
            for p in &self.products {
                if !search.is_empty() && !p.name.to_lowercase().contains(&search) { continue; }
                if let Some(c) = &cat { if p.category != *c { continue; } }
                ui.group(|ui| {
                    ui.label(&p.name);
                    ui.label(format!("{} · {}", p.category, cents(p.price_cents)));
                    if p.available {
                        if ui.button("+ Panier").clicked() { to_add = Some(p.id); }
                    } else { ui.label("Indisponible"); }
                });
                ui.add_space(4.0);
            }
            if let Some(id) = to_add {
                if let Some(p) = self.products.iter().find(|x| x.id == id).cloned() {
                    if let Some(line) = self.cart.iter_mut().find(|l| l.product.id == id) { line.qty += 1; }
                    else { self.cart.push(CartLine { product: p, qty: 1 }); }
                }
            }
        });
    }

    fn ui_cart(&mut self, ui: &mut egui::Ui) {
        if self.cart.is_empty() { ui.label("Panier vide"); return; }
        let mut total: i64 = 0;
        let mut remove: Option<usize> = None;
        for (i, line) in self.cart.iter_mut().enumerate() {
            ui.horizontal(|ui| {
                ui.label(&line.product.name);
                ui.label(format!("×{}", line.qty));
                ui.label(cents(line.product.price_cents * line.qty));
                if ui.button("−").clicked() && line.qty > 1 { line.qty -= 1; }
                if ui.button("+").clicked() { line.qty += 1; }
                if ui.button("🗑").clicked() { remove = Some(i); }
            });
            total += line.product.price_cents * line.qty;
        }
        if let Some(i) = remove { self.cart.remove(i); }
        ui.separator();
        ui.label(format!("Total : {}", cents(total)));
        if ui.button("Passer la commande").clicked() {
            self.notice = Some("Commande (API à brancher)".into());
        }
    }

    fn ui_orders(&mut self, ui: &mut egui::Ui) {
        if ui.button("Rafraîchir").clicked() { if let Some(t) = self.token.clone() { fetch_orders(self.tx.clone(), t); } }
        egui::ScrollArea::vertical().show(ui, |ui| {
            for o in &self.orders {
                ui.group(|ui| {
                    ui.label(format!("#{} · {} · {}", o.id, o.status, cents(o.total_cents)));
                    if let Some(c) = &o.customer { ui.label(c.name.clone().unwrap_or_default()); }
                    ui.label(o.items.iter().map(|i| format!("{}× {}", i.qty, i.name)).collect::<Vec<_>>().join(", "));
                });
                ui.add_space(4.0);
            }
        });
    }

    fn ui_profile(&mut self, ui: &mut egui::Ui) {
        if let Some(u) = &self.user {
            ui.label(format!("Nom : {}", u.name));
            ui.label(format!("Rôle : {}", u.role));
            if !u.is_supplier() {
                ui.label("Code fournisseur :");
                ui.text_edit_singleline(&mut self.supplier_code);
                if ui.button("Devenir fournisseur").clicked() {
                    if let Some(t) = self.token.clone() {
                        enter_supplier(self.tx.clone(), t, self.supplier_code.clone());
                    }
                }
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
                if ui.button("Rafraîchir").clicked() { if let Some(t)=self.token.clone(){fetch_orders(self.tx.clone(),t);} }
                for o in &self.orders { ui.label(format!("#{} {}", o.id, o.status)); }
            }
            1 => {
                ui.label("Nouveau produit :");
                ui.text_edit_singleline(&mut self.new_prod_name);
                ui.horizontal(|ui| { ui.label("Prix"); ui.text_edit_singleline(&mut self.new_prod_price); ui.label("Coût"); ui.text_edit_singleline(&mut self.new_prod_cost); });
                ui.text_edit_singleline(&mut self.new_prod_category);
                ui.checkbox(&mut self.new_prod_available, "Disponible");
                if ui.button("Ajouter").clicked() {
                    let price = self.new_prod_price.replace(',',".").parse::<f64>().unwrap_or(0.0);
                    let cost = self.new_prod_cost.replace(',',".").parse::<f64>().unwrap_or(0.0);
                    if let Some(t) = self.token.clone() {
                        create_product(self.tx.clone(), t, self.new_prod_name.clone(), None, (price*100.0) as i64, (cost*100.0) as i64, self.new_prod_category.clone(), self.new_prod_available);
                    }
                }
                ui.separator();
                if ui.button("Rafraîchir").clicked() { fetch_products(self.tx.clone(), self.token.clone()); }
                for p in &self.products { ui.horizontal(|ui| { ui.label(&p.name); ui.label(cents(p.price_cents)); if ui.button("🗑").clicked() { if let Some(t)=self.token.clone(){delete_product(self.tx.clone(),t,p.id);} } }); }
            }
            _ => {
                ui.label("Nouvelle catégorie :");
                ui.horizontal(|ui| { ui.text_edit_singleline(&mut self.new_cat); if ui.button("Ajouter").clicked() && !self.new_cat.trim().is_empty() { if let Some(t)=self.token.clone(){create_category(self.tx.clone(),t,self.new_cat.clone()); self.new_cat.clear();} } });
                ui.separator();
                if ui.button("Rafraîchir").clicked() { fetch_categories(self.tx.clone(), self.token.clone()); }
                for c in &self.categories {
                    ui.horizontal(|ui| {
                        ui.label(&c.name);
                        ui.label(format!("{} produit(s)", c.products_count));
                        if ui.button("Renommer").clicked() { self.notice = Some(format!("Renommer {} (à implémenter)", c.name)); }
                        if ui.button("🗑").clicked() { if let Some(t)=self.token.clone(){delete_category(self.tx.clone(),t,c.id);} }
                    });
                }
            }
        }
    }

    fn ui_finances(&mut self, ui: &mut egui::Ui) {
        if ui.button("Rafraîchir").clicked() { if let Some(t)=self.token.clone(){fetch_summary(self.tx.clone(),t.clone()); fetch_expenses(self.tx.clone(),t);} }
        if let Some(s) = &self.summary {
            ui.horizontal(|ui| {
                for (label, val) in [("Revenus", s.revenue_cents), ("Coûts", s.cost_cents), ("Marge", s.gross_margin_cents), ("Dépenses", s.expenses_cents), ("Net", s.net_cents)] {
                    ui.group(|ui| { ui.label(label); ui.label(cents(val)); });
                }
            });
        }
        ui.separator();
        ui.label("Nouvelle dépense :");
        ui.horizontal(|ui| { ui.label("Libellé"); ui.text_edit_singleline(&mut self.new_exp_label); ui.label("Montant"); ui.text_edit_singleline(&mut self.new_exp_amount); ui.label("Date"); ui.text_edit_singleline(&mut self.new_exp_date); });
        if ui.button("Ajouter").clicked() && !self.new_exp_label.trim().is_empty() {
            let amt = self.new_exp_amount.replace(',',".").parse::<f64>().unwrap_or(0.0);
            if let Some(t) = self.token.clone() {
                create_expense(self.tx.clone(), t, self.new_exp_label.clone(), (amt*100.0) as i64, if self.new_exp_date.is_empty(){None}else{Some(self.new_exp_date.clone())});
                self.new_exp_label.clear(); self.new_exp_amount.clear(); self.new_exp_date.clear();
            }
        }
        ui.separator();
        ui.label("Dépenses :");
        for e in &self.expenses {
            ui.horizontal(|ui| { ui.label(&e.label); ui.label(cents(e.amount_cents)); if ui.button("🗑").clicked() { if let Some(t)=self.token.clone(){delete_expense(self.tx.clone(),t,e.id);} } });
        }
    }

    fn ui_chat(&mut self, ui: &mut egui::Ui) {
        if self.conversations.is_empty() {
            if ui.button("Charger").clicked() { if let Some(t)=self.token.clone(){fetch_conversations(self.tx.clone(),t);} }
        }
        ui.horizontal(|ui| {
            // left: conversation list
            ui.vertical(|ui| {
                ui.label("Conversations");
                egui::ScrollArea::vertical().max_height(600.0).show(ui, |ui| {
                    for c in &self.conversations {
                        let sel = self.chat_id == Some(c.id);
                        if ui.selectable_label(sel, c.customer.as_ref().and_then(|x| x.name.clone()).unwrap_or_else(|| format!("#{}", c.id))).clicked() {
                            self.chat_id = Some(c.id);
                            if let Some(t) = self.token.clone() { fetch_messages(self.tx.clone(), t, c.id); }
                        }
                    }
                });
            });
            ui.separator();
            // right: thread
            ui.vertical(|ui| {
                if let Some(id) = self.chat_id {
                    ui.label(format!("Conversation #{}", id));
                    egui::ScrollArea::vertical().max_height(500.0).show(ui, |ui| {
                        for m in &self.chat_messages {
                            ui.label(&m.body);
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
                    ui.label("Sélectionne une conversation");
                }
            });
        });
    }
}

fn cents(c: i64) -> String { format!("{}.{:02} €", c / 100, (c % 100).abs()) }

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([1180.0, 760.0]),
        ..Default::default()
    };
    eframe::run_native("ShopTaBouffe", options, Box::new(|cc| {
        // Thème sombre avec accent orange (cohérent avec Android).
        let mut style = (*cc.egui_ctx.style()).clone();
        style.visuals = egui::Visuals::dark();
        style.visuals.widgets.noninteractive.bg_fill = egui::Color32::from_rgb(28, 28, 34);
        style.visuals.widgets.inactive.bg_fill = egui::Color32::from_rgb(40, 40, 48);
        style.visuals.widgets.hovered.bg_fill = egui::Color32::from_rgb(55, 55, 65);
        style.visuals.widgets.active.bg_fill = egui::Color32::from_rgb(239, 108, 51);
        style.visuals.selection.bg_fill = egui::Color32::from_rgb(239, 108, 51);
        style.visuals.hyperlink_color = egui::Color32::from_rgb(239, 108, 51);
        style.spacing.item_spacing = egui::vec2(8.0, 6.0);
        style.spacing.button_padding = egui::vec2(10.0, 6.0);
        cc.egui_ctx.set_style(style);
        Ok(Box::new(ShopApp::default()))
    }))
}
