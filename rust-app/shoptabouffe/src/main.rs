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
struct OrderCustomer { name: Option<String> }
#[derive(Clone, Debug, Default, Deserialize)]
struct Order { id: i64, status: String, #[serde(rename="totalCents")] total_cents: i64, #[serde(rename="createdAt")] created_at: Option<String>, items: Vec<OrderItem>, customer: Option<OrderCustomer> }

#[derive(Clone, Debug, Default, Deserialize)]
struct FinanceSummary { #[serde(rename="revenueCents", default)] revenue_cents: i64, #[serde(rename="costCents", default)] cost_cents: i64, #[serde(rename="grossMarginCents", default)] gross_margin_cents: i64, #[serde(rename="expensesCents", default)] expenses_cents: i64, #[serde(rename="netCents", default)] net_cents: i64, orders: i64, units: i64, #[serde(rename="expenseCount", default)] expense_count: i64 }

#[derive(Clone, Debug, Default, Deserialize)]
struct Expense { id: i64, label: String, #[serde(rename="amountCents")] amount_cents: i64, date: Option<String> }

#[derive(Clone, Debug, Default)]
struct CartLine { product: Product, qty: i64 }

enum Screen { Login, Boutique, Cart, Orders, Profile, Admin, Finances }

enum Msg {
    LoginOk(User, String),
    LoginErr(String),
    Products(Vec<Product>),
    Orders(Vec<Order>),
    Summary(FinanceSummary),
    Expenses(Vec<Expense>),
    Error(String),
}

struct ShopApp {
    screen: Screen,
    token: Option<String>,
    user: Option<User>,
    // login
    name_input: String,
    token_paste: String,
    busy: bool,
    notice: Option<String>,
    // data
    products: Vec<Product>,
    search: String,
    category: Option<String>,
    cart: Vec<CartLine>,
    orders: Vec<Order>,
    // admin
    admin_tab: usize,
    // finances
    summary: Option<FinanceSummary>,
    expenses: Vec<Expense>,
    // async
    rx: Receiver<Msg>,
    tx: Sender<Msg>,
}

impl Default for ShopApp {
    fn default() -> Self {
        let (tx, rx) = channel();
        Self {
            screen: Screen::Login, token: None, user: None,
            name_input: String::new(), token_paste: String::new(), busy: false, notice: None,
            products: vec![], search: String::new(), category: None, cart: vec![], orders: vec![],
            admin_tab: 0, summary: None, expenses: vec![],
            rx, tx,
        }
    }
}

fn api_get<T: for<'de> Deserialize<'de> + Send + 'static>(tx: Sender<Msg>, path: String, token: Option<String>) {
    thread::spawn(move || {
        let url = format!("{}/{}", API_BASE, path.trim_start_matches('/'));
        let mut req = reqwest::blocking::Client::new().get(&url);
        if let Some(t) = token { req = req.bearer_auth(t); }
        match req.send() {
            Ok(r) => {
                if r.status().is_success() {
                    match r.json::<T>() { Ok(v) => { /* dispatch handled by caller via wrapper */ let _ = v; } Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); } }
                } else { let _ = tx.send(Msg::Error(format!("HTTP {}", r.status()))); }
            }
            Err(e) => { let _ = tx.send(Msg::Error(e.to_string())); }
        }
    });
}

// Helper macros for dispatching typed responses are not trivial with generics; instead do explicit fetch functions.

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

fn demo_login(tx: Sender<Msg>, name: String) {
    thread::spawn(move || {
        #[derive(Serialize)] struct B { name: String }
        #[derive(Deserialize)] struct R { token: String, user: User }
        let url = format!("{}/auth/demo", API_BASE);
        let body = B { name };
        match reqwest::blocking::Client::new().post(&url).json(&body).send() {
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
        let body = B { code };
        match reqwest::blocking::Client::new().post(&url).bearer_auth(&token).json(&body).send() {
            Ok(r) if r.status().is_success() => {
                if let Ok(v) = r.json::<R>() { let _ = tx.send(Msg::LoginOk(v.user, token)); }
            }
            Ok(r) => { let _ = tx.send(Msg::LoginErr(format!("HTTP {}", r.status()))); }
            Err(e) => { let _ = tx.send(Msg::LoginErr(e.to_string())); }
        }
    });
}

impl eframe::App for ShopApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // drain messages
        while let Ok(m) = self.rx.try_recv() {
            match m {
                Msg::LoginOk(u, t) => { self.user = Some(u); self.token = Some(t); self.busy = false; self.screen = Screen::Boutique; self.notice = Some("Connecté".into()); fetch_products(self.tx.clone(), self.token.clone()); }
                Msg::LoginErr(e) => { self.busy = false; self.notice = Some(e); }
                Msg::Products(p) => { self.products = p; }
                Msg::Orders(o) => { self.orders = o; }
                Msg::Summary(s) => { self.summary = Some(s); }
                Msg::Expenses(e) => { self.expenses = e; }
                Msg::Error(e) => { self.notice = Some(e); self.busy = false; }
            }
        }

        // top bar
        egui::TopBottomPanel::top("top").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading("ShopTaBouffe");
                if let Some(u) = &self.user {
                    ui.label(format!("· {}", u.name));
                    if u.is_supplier() { ui.label("(fournisseur)"); }
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if self.user.is_some() {
                        if ui.button("Déconnexion").clicked() { self.user = None; self.token = None; self.screen = Screen::Login; }
                    }
                });
            });
            // nav tabs
            ui.horizontal(|ui| {
                let tabs = if self.user.as_ref().map(|u| u.is_supplier()).unwrap_or(false) {
                    vec![("Boutique", Screen::Boutique), ("Panier", Screen::Cart), ("Commandes", Screen::Orders), ("Produits", Screen::Admin), ("Finances", Screen::Finances), ("Profil", Screen::Profile)]
                } else {
                    vec![("Boutique", Screen::Boutique), ("Panier", Screen::Cart), ("Commandes", Screen::Orders), ("Profil", Screen::Profile)]
                };
                for (label, scr) in tabs {
                    let selected = std::mem::discriminant(&self.screen) == std::mem::discriminant(&scr);
                    if ui.selectable_label(selected, label).clicked() { self.screen = scr; }
                }
            });
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
            ui.add_space(10.0);
            ui.label("Ou coller un token obtenu via le navigateur :");
            ui.text_edit_singleline(&mut self.token_paste);
            if ui.button("Utiliser ce token").clicked() && !self.token_paste.trim().is_empty() {
                self.token = Some(self.token_paste.trim().to_string());
                self.screen = Screen::Boutique;
                fetch_products(self.tx.clone(), self.token.clone());
            }
        });
    }

    fn ui_boutique(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            ui.label("Rechercher");
            ui.text_edit_singleline(&mut self.search);
        });
        // category chips
        let cats: Vec<String> = {
            let mut s: std::collections::BTreeSet<String> = self.products.iter().map(|p| p.category.clone()).collect();
            let _ = &mut s;
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
            // TODO: POST /orders
            self.notice = Some("Commande envoyée (à implémenter)".into());
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
                // reuse name_input as code input
                ui.text_edit_singleline(&mut self.name_input);
                if ui.button("Devenir fournisseur").clicked() {
                    if let Some(t) = self.token.clone() {
                        enter_supplier(self.tx.clone(), t, self.name_input.clone());
                    }
                }
            } else {
                if ui.button("Quitter le mode fournisseur").clicked() {
                    // TODO: POST /admin/logout-role
                }
            }
        }
    }

    fn ui_admin(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            for (i, label) in ["Commandes", "Produits"].iter().enumerate() {
                if ui.selectable_label(self.admin_tab == i, *label).clicked() { self.admin_tab = i; }
            }
        });
        ui.separator();
        match self.admin_tab {
            0 => { if ui.button("Rafraîchir").clicked() { if let Some(t)=self.token.clone(){fetch_orders(self.tx.clone(),t);} } for o in &self.orders { ui.label(format!("#{} {}", o.id, o.status)); } }
            _ => {
                if ui.button("+ Produit").clicked() { self.notice = Some("Ajout produit à implémenter".into()); }
                for p in &self.products { ui.label(format!("{} · {} · {}", p.name, p.category, cents(p.price_cents))); }
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
        ui.label("Dépenses :");
        for e in &self.expenses { ui.label(format!("{} · {}", e.label, cents(e.amount_cents))); }
    }
}

fn cents(c: i64) -> String {
    format!("{}.{:02} €", c / 100, (c % 100).abs())
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([1100.0, 720.0]),
        ..Default::default()
    };
    eframe::run_native("ShopTaBouffe", options, Box::new(|_cc| Ok(Box::new(ShopApp::default()))))
}
