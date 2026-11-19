#![windows_subsystem = "windows"]

use eframe::egui;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;
use std::time::{Duration, Instant};

const API_BASE: &str = "https://chorizo.dpdns.org/api";
const APP_VERSION: &str = "1.0.6";
const ORANGE: egui::Color32 = egui::Color32::from_rgb(239, 108, 51);
const SURFACE: egui::Color32 = egui::Color32::from_rgb(24, 24, 30);
const SURFACE2: egui::Color32 = egui::Color32::from_rgb(34, 34, 42);
const TEXT_MUTED: egui::Color32 = egui::Color32::from_rgb(155, 163, 178);
const GREEN: egui::Color32 = egui::Color32::from_rgb(52, 211, 153);
const RED: egui::Color32 = egui::Color32::from_rgb(248, 113, 113);

// ---------- Modèles ----------

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
struct User {
    id: i64,
    name: String,
    role: String,
    #[serde(rename = "avatarUrl", default)]
    avatar_url: Option<String>,
    #[serde(default)]
    provider: Option<String>,
}

impl User {
    fn is_supplier(&self) -> bool {
        self.role == "supplier"
    }
    /// Login par nom (provider "demo") = pas de chat, sauf si devenu fournisseur.
    fn can_chat(&self) -> bool {
        self.is_supplier() || self.provider.as_deref() != Some("demo")
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
struct Product {
    id: i64,
    name: String,
    description: Option<String>,
    #[serde(rename = "priceCents")]
    price_cents: i64,
    #[serde(rename = "costCents", default)]
    cost_cents: i64,
    category: String,
    #[serde(rename = "imageUrl")]
    image_url: Option<String>,
    available: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct OrderItem {
    #[serde(rename = "productId")]
    product_id: i64,
    name: String,
    #[serde(rename = "priceCents")]
    price_cents: i64,
    qty: i64,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct OrderCustomer {
    name: Option<String>,
    id: Option<i64>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct Order {
    id: i64,
    status: String,
    #[serde(rename = "totalCents")]
    total_cents: i64,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    items: Vec<OrderItem>,
    customer: Option<OrderCustomer>,
    phone: Option<String>,
    address: Option<String>,
    note: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct FinanceSummary {
    #[serde(rename = "revenueCents", default)]
    revenue_cents: i64,
    #[serde(rename = "costCents", default)]
    cost_cents: i64,
    #[serde(rename = "grossMarginCents", default)]
    gross_margin_cents: i64,
    #[serde(rename = "expensesCents", default)]
    expenses_cents: i64,
    #[serde(rename = "netCents", default)]
    net_cents: i64,
    orders: i64,
    units: i64,
    #[serde(rename = "expenseCount", default)]
    expense_count: i64,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct Expense {
    id: i64,
    label: String,
    #[serde(rename = "amountCents")]
    amount_cents: i64,
    date: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct Category {
    id: i64,
    name: String,
    #[serde(rename = "productsCount", default)]
    products_count: i64,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct Conversation {
    id: i64,
    customer: Option<OrderCustomer>,
    #[serde(rename = "lastMessage")]
    last_message: Option<MsgPreview>,
    #[serde(rename = "unreadCount", default)]
    unread_count: i64,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct MsgPreview {
    body: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct ChatMessage {
    id: i64,
    body: String,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
    #[serde(rename = "senderId")]
    sender_id: Option<i64>,
    #[serde(rename = "senderName")]
    sender_name: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Screen {
    Login,
    Boutique,
    Cart,
    Orders,
    Profile,
    Admin,
    Finances,
    Chat,
}

enum Msg {
    LoginOk(User, String),
    LoginErr(String),
    RoleUpdated(User),
    Products(Vec<Product>),
    Orders(Vec<Order>),
    Summary(FinanceSummary),
    Expenses(Vec<Expense>),
    Categories(Vec<Category>),
    Conversations(Vec<Conversation>),
    Messages(i64, Vec<ChatMessage>),
    MessageSent,
    OrderPlaced,
    ImageUploaded(String),
    ImageLoaded(String, egui::ColorImage),
    UpdateAvailable(String, String),
    ExitApp,
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
    notice_at: Option<Instant>,
    products: Vec<Product>,
    search: String,
    category: Option<String>,
    cart: Vec<CartLine>,
    orders: Vec<Order>,
    expanded_order: Option<i64>,
    admin_tab: usize,
    summary: Option<FinanceSummary>,
    expenses: Vec<Expense>,
    categories: Vec<Category>,
    conversations: Vec<Conversation>,
    chat_id: Option<i64>,
    chat_messages: Vec<ChatMessage>,
    chat_input: String,
    new_cat: String,
    rename_buf: String,
    rename_id: Option<i64>,
    new_exp_label: String,
    new_exp_amount: String,
    new_exp_date: String,
    new_prod_name: String,
    new_prod_price: String,
    new_prod_cost: String,
    new_prod_category: String,
    new_prod_desc: String,
    new_prod_available: bool,
    new_prod_image: String,
    image_path: String,
    editing_id: Option<i64>,
    order_address: String,
    order_phone: String,
    order_note: String,
    supplier_code: String,
    update_version: Option<String>,
    update_url: Option<String>,
    last_poll: Option<Instant>,
    images: HashMap<String, egui::TextureHandle>,
    img_pending: HashSet<String>,
    rx: Receiver<Msg>,
    tx: Sender<Msg>,
}

#[derive(Clone, Debug, Default)]
struct CartLine {
    product: Product,
    qty: i64,
}

impl Default for ShopApp {
    fn default() -> Self {
        let (tx, rx) = channel();
        // Auto-update : compare la version locale à la dernière release GitHub.
        let txu = tx.clone();
        thread::spawn(move || {
            #[derive(Deserialize)]
            struct Asset {
                name: String,
                browser_download_url: String,
            }
            #[derive(Deserialize)]
            struct Rel {
                tag_name: String,
                assets: Vec<Asset>,
            }
            let url = "https://api.github.com/repos/tear360/ShopTaBouffe/releases/latest";
            if let Ok(r) = reqwest::blocking::Client::new()
                .get(url)
                .header("User-Agent", "ShopTaBouffe")
                .send()
            {
                if r.status().is_success() {
                    if let Ok(rel) = r.json::<Rel>() {
                        let ver = rel.tag_name.trim_start_matches('v').to_string();
                        if is_newer(&ver, APP_VERSION) {
                            if let Some(a) = rel.assets.into_iter().find(|a| a.name.ends_with(".exe")) {
                                let _ = txu.send(Msg::UpdateAvailable(ver, a.browser_download_url));
                            }
                        }
                    }
                }
            }
        });
        Self {
            screen: Screen::Login,
            token: None,
            user: None,
            name_input: String::new(),
            busy: false,
            notice: None,
            notice_at: None,
            products: vec![],
            search: String::new(),
            category: None,
            cart: vec![],
            orders: vec![],
            expanded_order: None,
            admin_tab: 0,
            summary: None,
            expenses: vec![],
            categories: vec![],
            conversations: vec![],
            chat_id: None,
            chat_messages: vec![],
            chat_input: String::new(),
            new_cat: String::new(),
            rename_buf: String::new(),
            rename_id: None,
            new_exp_label: String::new(),
            new_exp_amount: String::new(),
            new_exp_date: String::new(),
            new_prod_name: String::new(),
            new_prod_price: String::new(),
            new_prod_cost: String::new(),
            new_prod_category: String::new(),
            new_prod_desc: String::new(),
            new_prod_available: true,
            new_prod_image: String::new(),
            image_path: String::new(),
            editing_id: None,
            order_address: String::new(),
            order_phone: String::new(),
            order_note: String::new(),
            supplier_code: String::new(),
            update_version: None,
            update_url: None,
            last_poll: None,
            images: HashMap::new(),
            img_pending: HashSet::new(),
            rx,
            tx,
        }
    }
}

// ---------- Helpers HTTP ----------

fn http_err(r: reqwest::blocking::Response) -> String {
    let status = r.status();
    if let Ok(v) = r.json::<serde_json::Value>() {
        if let Some(e) = v.get("error").and_then(|x| x.as_str()) {
            return e.to_string();
        }
    }
    format!("HTTP {}", status)
}

fn fetch_products(tx: Sender<Msg>, token: Option<String>) {
    thread::spawn(move || {
        let url = format!("{}/products", API_BASE);
        let mut req = reqwest::blocking::Client::new().get(&url);
        if let Some(t) = token {
            req = req.bearer_auth(t);
        }
        match req.send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)]
                struct R {
                    products: Vec<Product>,
                }
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::Products(v.products));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

/// supplier → GET /orders (toutes) ; client → GET /orders/mine (les siennes).
fn fetch_orders(tx: Sender<Msg>, token: String, supplier: bool) {
    thread::spawn(move || {
        let url = if supplier {
            format!("{}/orders", API_BASE)
        } else {
            format!("{}/orders/mine", API_BASE)
        };
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)]
                struct R {
                    orders: Vec<Order>,
                }
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::Orders(v.orders));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn fetch_summary(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        let url = format!("{}/finances/summary", API_BASE);
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                if let Ok(v) = r.json::<FinanceSummary>() {
                    let _ = tx.send(Msg::Summary(v));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn fetch_expenses(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        let url = format!("{}/finances/expenses", API_BASE);
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)]
                struct R {
                    expenses: Vec<Expense>,
                }
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::Expenses(v.expenses));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn fetch_categories(tx: Sender<Msg>, token: Option<String>) {
    thread::spawn(move || {
        let url = format!("{}/categories", API_BASE);
        let mut req = reqwest::blocking::Client::new().get(&url);
        if let Some(t) = token {
            req = req.bearer_auth(t);
        }
        match req.send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)]
                struct R {
                    categories: Vec<Category>,
                }
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::Categories(v.categories));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn fetch_conversations(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        let url = format!("{}/conversations", API_BASE);
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)]
                struct R {
                    conversations: Vec<Conversation>,
                }
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::Conversations(v.conversations));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn fetch_messages(tx: Sender<Msg>, token: String, conv_id: i64) {
    thread::spawn(move || {
        let url = format!("{}/conversations/{}/messages", API_BASE, conv_id);
        match reqwest::blocking::Client::new().get(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                #[derive(Deserialize)]
                struct R {
                    messages: Vec<ChatMessage>,
                }
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::Messages(conv_id, v.messages));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn mark_read(token: String, conv_id: i64) {
    thread::spawn(move || {
        let url = format!("{}/conversations/{}/read", API_BASE, conv_id);
        let _ = reqwest::blocking::Client::new()
            .post(&url)
            .bearer_auth(&token)
            .send();
    });
}

fn send_message(tx: Sender<Msg>, token: String, conv_id: i64, body: String) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            body: String,
        }
        let url = format!("{}/conversations/{}/messages", API_BASE, conv_id);
        match reqwest::blocking::Client::new()
            .post(&url)
            .bearer_auth(&token)
            .json(&B { body })
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::MessageSent);
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn demo_login(tx: Sender<Msg>, name: String) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            name: String,
        }
        #[derive(Deserialize)]
        struct R {
            token: String,
            user: User,
        }
        let url = format!("{}/auth/demo", API_BASE);
        match reqwest::blocking::Client::new().post(&url).json(&B { name }).send() {
            Ok(r) if r.status().is_success() => {
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::LoginOk(v.user, v.token));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::LoginErr(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::LoginErr(e.to_string()));
            }
        }
    });
}

fn enter_supplier(tx: Sender<Msg>, token: String, code: String) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            code: String,
        }
        #[derive(Deserialize)]
        struct R {
            user: User,
        }
        let url = format!("{}/admin/enter", API_BASE);
        match reqwest::blocking::Client::new()
            .post(&url)
            .bearer_auth(&token)
            .json(&B { code })
            .send()
        {
            Ok(r) if r.status().is_success() => {
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::LoginOk(v.user, token));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::LoginErr(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::LoginErr(e.to_string()));
            }
        }
    });
}

fn leave_supplier(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        #[derive(Deserialize)]
        struct R {
            user: User,
        }
        let url = format!("{}/admin/logout-role", API_BASE);
        match reqwest::blocking::Client::new().post(&url).bearer_auth(&token).send() {
            Ok(r) if r.status().is_success() => {
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::RoleUpdated(v.user));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn create_category(tx: Sender<Msg>, token: String, name: String) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            name: String,
        }
        let url = format!("{}/categories", API_BASE);
        match reqwest::blocking::Client::new()
            .post(&url)
            .bearer_auth(&token)
            .json(&B { name })
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::Notice("Catégorie ajoutée".into()));
                fetch_categories(tx.clone(), Some(token));
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn rename_category(tx: Sender<Msg>, token: String, id: i64, name: String) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            name: String,
        }
        let url = format!("{}/categories/{}", API_BASE, id);
        match reqwest::blocking::Client::new()
            .patch(&url)
            .bearer_auth(&token)
            .json(&B { name })
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::Notice("Catégorie renommée".into()));
                fetch_categories(tx.clone(), Some(token));
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn delete_category(tx: Sender<Msg>, token: String, id: i64) {
    thread::spawn(move || {
        let url = format!("{}/categories/{}", API_BASE, id);
        match reqwest::blocking::Client::new()
            .delete(&url)
            .bearer_auth(&token)
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::Notice("Catégorie supprimée".into()));
                fetch_categories(tx.clone(), Some(token));
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn create_expense(tx: Sender<Msg>, token: String, label: String, amount_cents: i64, date: Option<String>) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            label: String,
            #[serde(rename = "amountCents")]
            amount_cents: i64,
            date: Option<String>,
        }
        let url = format!("{}/finances/expenses", API_BASE);
        match reqwest::blocking::Client::new()
            .post(&url)
            .bearer_auth(&token)
            .json(&B {
                label,
                amount_cents,
                date,
            })
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::Notice("Dépense ajoutée".into()));
                fetch_expenses(tx.clone(), token);
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn delete_expense(tx: Sender<Msg>, token: String, id: i64) {
    thread::spawn(move || {
        let url = format!("{}/finances/expenses/{}", API_BASE, id);
        match reqwest::blocking::Client::new()
            .delete(&url)
            .bearer_auth(&token)
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::Notice("Dépense supprimée".into()));
                fetch_expenses(tx.clone(), token);
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

#[allow(clippy::too_many_arguments)]
fn create_product(
    tx: Sender<Msg>,
    token: String,
    name: String,
    desc: Option<String>,
    price_cents: i64,
    cost_cents: i64,
    category: String,
    image_url: Option<String>,
    available: bool,
) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            name: String,
            description: Option<String>,
            #[serde(rename = "priceCents")]
            price_cents: i64,
            #[serde(rename = "costCents")]
            cost_cents: i64,
            category: String,
            #[serde(rename = "imageUrl")]
            image_url: Option<String>,
            available: bool,
        }
        let url = format!("{}/products", API_BASE);
        let body = B {
            name,
            description: desc,
            price_cents,
            cost_cents,
            category,
            image_url,
            available,
        };
        match reqwest::blocking::Client::new()
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::Notice("Produit ajouté".into()));
                fetch_products(tx.clone(), Some(token));
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

#[allow(clippy::too_many_arguments)]
fn update_product(
    tx: Sender<Msg>,
    token: String,
    id: i64,
    name: String,
    desc: Option<String>,
    price_cents: i64,
    cost_cents: i64,
    category: String,
    image_url: Option<String>,
    available: bool,
) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            name: String,
            description: Option<String>,
            #[serde(rename = "priceCents")]
            price_cents: i64,
            #[serde(rename = "costCents")]
            cost_cents: i64,
            category: String,
            #[serde(rename = "imageUrl")]
            image_url: Option<String>,
            available: bool,
        }
        let url = format!("{}/products/{}", API_BASE, id);
        let body = B {
            name,
            description: desc,
            price_cents,
            cost_cents,
            category,
            image_url,
            available,
        };
        match reqwest::blocking::Client::new()
            .patch(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::Notice("Produit modifié".into()));
                fetch_products(tx.clone(), Some(token));
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn delete_product(tx: Sender<Msg>, token: String, id: i64) {
    thread::spawn(move || {
        let url = format!("{}/products/{}", API_BASE, id);
        match reqwest::blocking::Client::new()
            .delete(&url)
            .bearer_auth(&token)
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::Notice("Produit supprimé".into()));
                fetch_products(tx.clone(), Some(token));
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

/// POST /uploads/product-image (multipart, champ « image ») → { url }
fn upload_image(tx: Sender<Msg>, token: String, path: String) {
    thread::spawn(move || {
        if !std::path::Path::new(&path).is_file() {
            let _ = tx.send(Msg::Error("Fichier introuvable.".into()));
            return;
        }
        #[derive(Deserialize)]
        struct R {
            url: String,
        }
        let form = match reqwest::blocking::multipart::Form::new().file("image", &path) {
            Ok(f) => f,
            Err(e) => {
                let _ = tx.send(Msg::Error(format!("Lecture impossible : {}", e)));
                return;
            }
        };
        let url = format!("{}/uploads/product-image", API_BASE);
        match reqwest::blocking::Client::new()
            .post(&url)
            .bearer_auth(&token)
            .multipart(form)
            .send()
        {
            Ok(r) if r.status().is_success() => {
                if let Ok(v) = r.json::<R>() {
                    let _ = tx.send(Msg::ImageUploaded(v.url));
                }
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

#[derive(Serialize)]
struct OrderLine {
    #[serde(rename = "productId")]
    product_id: i64,
    qty: i64,
}

fn place_order(
    tx: Sender<Msg>,
    token: String,
    items: Vec<OrderLine>,
    address: String,
    phone: String,
    note: String,
) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            items: Vec<OrderLine>,
            address: String,
            phone: String,
            note: String,
        }
        let url = format!("{}/orders", API_BASE);
        match reqwest::blocking::Client::new()
            .post(&url)
            .bearer_auth(&token)
            .json(&B {
                items,
                address,
                phone,
                note,
            })
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::OrderPlaced);
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

fn update_order_status(tx: Sender<Msg>, token: String, id: i64, status: String) {
    thread::spawn(move || {
        #[derive(Serialize)]
        struct B {
            status: String,
        }
        let url = format!("{}/orders/{}", API_BASE, id);
        match reqwest::blocking::Client::new()
            .patch(&url)
            .bearer_auth(&token)
            .json(&B { status })
            .send()
        {
            Ok(r) if r.status().is_success() => {
                let _ = tx.send(Msg::Notice("Statut mis à jour".into()));
                fetch_orders(tx.clone(), token, true);
            }
            Ok(r) => {
                let _ = tx.send(Msg::Error(http_err(r)));
            }
            Err(e) => {
                let _ = tx.send(Msg::Error(e.to_string()));
            }
        }
    });
}

/// Télécharge et décode une image produit en arrière-plan.
fn fetch_image(url: String, tx: Sender<Msg>) {
    thread::spawn(move || {
        if let Ok(r) = reqwest::blocking::Client::new().get(&url).send() {
            if !r.status().is_success() {
                return;
            }
            if let Ok(bytes) = r.bytes() {
                if let Ok(img) = image::load_from_memory(&bytes) {
                    let img = img.resize(480, 480, image::imageops::FilterType::Triangle);
                    let rgba = img.to_rgba8();
                    let (w, h) = (rgba.width() as usize, rgba.height() as usize);
                    let ci = egui::ColorImage::from_rgba_unmultiplied([w, h], rgba.as_raw());
                    let _ = tx.send(Msg::ImageLoaded(url, ci));
                }
            }
        }
    });
}

// ---------- Helpers UI ----------

fn card(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui)) {
    egui::Frame::new()
        .fill(SURFACE)
        .stroke(egui::Stroke::new(1.0_f32, egui::Color32::from_rgb(45, 45, 55)))
        .corner_radius(egui::CornerRadius::same(12))
        .inner_margin(egui::Margin::same(12))
        .show(ui, |ui| add(ui));
}

fn section_title(ui: &mut egui::Ui, text: &str) {
    ui.add_space(4.0);
    ui.label(
        egui::RichText::new(text)
            .size(15.0)
            .strong()
            .color(egui::Color32::WHITE),
    );
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

fn cents(c: i64) -> String {
    format!("{}.{:02} €", c / 100, (c % 100).abs())
}

fn euros_to_cents(s: &str) -> i64 {
    (s.replace(',', ".").parse::<f64>().unwrap_or(0.0) * 100.0).round() as i64
}

fn status_fr(s: &str) -> &'static str {
    match s {
        "pending" => "En attente",
        "accepted" => "Acceptée",
        "preparing" => "En préparation",
        "delivering" => "En livraison",
        "delivered" => "Livrée",
        "refused" => "Refusée",
        _ => "Inconnu",
    }
}

fn status_color(s: &str) -> egui::Color32 {
    match s {
        "pending" => egui::Color32::from_rgb(250, 204, 21),
        "accepted" | "preparing" => egui::Color32::from_rgb(96, 165, 250),
        "delivering" => egui::Color32::from_rgb(167, 139, 250),
        "delivered" => GREEN,
        "refused" => RED,
        _ => TEXT_MUTED,
    }
}

/// Transitions strictes du backend (§4).
fn next_statuses(s: &str) -> &'static [&'static str] {
    match s {
        "pending" => &["accepted", "refused"],
        "accepted" => &["preparing"],
        "preparing" => &["delivering"],
        "delivering" => &["delivered"],
        _ => &[],
    }
}

fn status_action(s: &str) -> &'static str {
    match s {
        "accepted" => "✓ Accepter",
        "refused" => "✕ Refuser",
        "preparing" => "🍳 Passer en préparation",
        "delivering" => "🚚 Passer en livraison",
        "delivered" => "✔ Marquer livrée",
        _ => "",
    }
}

/// Compare deux versions « X.Y.Z » : true si `newer` est strictement supérieur à `current`.
fn is_newer(newer: &str, current: &str) -> bool {
    fn tuple(v: &str) -> (u64, u64, u64) {
        let mut it = v.split('.').map(|p| {
            p.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        });
        (it.next().unwrap_or(0), it.next().unwrap_or(0), it.next().unwrap_or(0))
    }
    tuple(newer) > tuple(current)
}

fn short_time(iso: &Option<String>) -> String {
    match iso {
        Some(t) if t.len() >= 16 => t[11..16].to_string(),
        Some(t) => t.clone(),
        None => String::new(),
    }
}

// ---------- Application ----------

impl ShopApp {
    fn set_notice(&mut self, msg: impl Into<String>) {
        self.notice = Some(msg.into());
        self.notice_at = Some(Instant::now());
    }

    fn is_supplier(&self) -> bool {
        self.user.as_ref().map(|u| u.is_supplier()).unwrap_or(false)
    }

    fn reload_orders(&self) {
        if let Some(t) = self.token.clone() {
            fetch_orders(self.tx.clone(), t, self.is_supplier());
        }
    }

    /// Chargement automatique quand on change d'écran (comme au scroll sur Android).
    fn on_screen_change(&mut self) {
        match self.screen {
            Screen::Boutique => fetch_products(self.tx.clone(), self.token.clone()),
            Screen::Orders => self.reload_orders(),
            Screen::Chat => {
                if let Some(t) = self.token.clone() {
                    fetch_conversations(self.tx.clone(), t);
                }
            }
            Screen::Admin => {
                self.reload_orders();
                fetch_products(self.tx.clone(), self.token.clone());
                fetch_categories(self.tx.clone(), self.token.clone());
            }
            Screen::Finances => {
                if let Some(t) = self.token.clone() {
                    fetch_summary(self.tx.clone(), t.clone());
                    fetch_expenses(self.tx.clone(), t);
                }
            }
            _ => {}
        }
        self.last_poll = Some(Instant::now());
    }

    fn reset_product_form(&mut self) {
        self.editing_id = None;
        self.new_prod_name.clear();
        self.new_prod_price.clear();
        self.new_prod_cost.clear();
        self.new_prod_category.clear();
        self.new_prod_desc.clear();
        self.new_prod_available = true;
        self.new_prod_image.clear();
        self.image_path.clear();
    }

    /// Vignette produit (avec cache d'images téléchargées).
    fn product_thumb(&mut self, ui: &mut egui::Ui, url: Option<&str>, size: f32) {
        let (rect, _) = ui.allocate_exact_size(egui::vec2(size, size), egui::Sense::hover());
        ui.painter().rect_filled(rect, 8.0, SURFACE2);
        let url = url.filter(|u| !u.is_empty());
        match url {
            Some(u) => {
                if !self.images.contains_key(u) && !self.img_pending.contains(u) {
                    self.img_pending.insert(u.to_string());
                    let tx = self.tx.clone();
                    fetch_image(u.to_string(), tx);
                }
                if let Some(t) = self.images.get(u) {
                    let uv = egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0));
                    ui.painter()
                        .image(t.id(), rect, uv, egui::Color32::WHITE);
                } else {
                    ui.painter().text(
                        rect.center(),
                        egui::Align2::CENTER_CENTER,
                        "🖼️",
                        egui::FontId::proportional(size * 0.45),
                        TEXT_MUTED,
                    );
                }
            }
            None => {
                ui.painter().text(
                    rect.center(),
                    egui::Align2::CENTER_CENTER,
                    "🍽️",
                    egui::FontId::proportional(size * 0.45),
                    TEXT_MUTED,
                );
            }
        }
    }

    fn add_to_cart(&mut self, product: &Product) {
        if let Some(line) = self.cart.iter_mut().find(|l| l.product.id == product.id) {
            line.qty += 1;
        } else {
            self.cart.push(CartLine {
                product: product.clone(),
                qty: 1,
            });
        }
    }

    // ----- Écrans -----

    fn ui_login(&mut self, ui: &mut egui::Ui) {
        ui.vertical_centered(|ui| {
            ui.add_space(56.0);
            ui.label(egui::RichText::new("🛍️").size(56.0));
            ui.add_space(8.0);
            ui.label(
                egui::RichText::new("ShopTaBouffe")
                    .size(28.0)
                    .strong()
                    .color(ORANGE),
            );
            ui.label(egui::RichText::new("Vos commerçants locaux, en un clic").color(TEXT_MUTED));
            ui.add_space(28.0);
            card(ui, |ui| {
                ui.set_min_width(340.0);
                ui.label(egui::RichText::new("Votre nom").strong());
                ui.text_edit_singleline(&mut self.name_input);
                ui.add_space(8.0);
                let busy = self.busy;
                let label = if busy { "Connexion…" } else { "Se connecter avec ce nom" };
                if ui
                    .add_enabled(!busy && !self.name_input.trim().is_empty(), egui::Button::new(label))
                    .clicked()
                {
                    self.busy = true;
                    let name = self.name_input.trim().to_string();
                    demo_login(self.tx.clone(), name);
                }
            });
            ui.add_space(16.0);
            ui.label(egui::RichText::new("ou continuer avec").color(TEXT_MUTED));
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                let google = egui::Button::new(
                    egui::RichText::new("Continuer avec Google").color(egui::Color32::from_rgb(32, 33, 36)),
                )
                .fill(egui::Color32::WHITE)
                .stroke(egui::Stroke::new(1.0_f32, egui::Color32::from_rgb(200, 200, 200)));
                if ui.add(google).clicked() {
                    let _ = open::that("https://chorizo.dpdns.org/api/auth/start?provider=google&target=web");
                }
                let github = egui::Button::new(
                    egui::RichText::new("Continuer avec GitHub").color(egui::Color32::from_rgb(36, 41, 47)),
                )
                .fill(egui::Color32::from_rgb(246, 248, 250))
                .stroke(egui::Stroke::new(1.0_f32, egui::Color32::from_rgb(208, 215, 222)));
                if ui.add(github).clicked() {
                    let _ = open::that("https://chorizo.dpdns.org/api/auth/start?provider=github&target=web");
                }
            });
            ui.add_space(12.0);
            ui.label(
                egui::RichText::new("Après connexion via le navigateur, revenez ici.")
                    .size(11.0)
                    .color(TEXT_MUTED),
            );
        });
    }

    fn ui_boutique(&mut self, ui: &mut egui::Ui) {
        let supplier = self.is_supplier();
        ui.horizontal(|ui| {
            ui.label("🔍");
            ui.text_edit_singleline(&mut self.search);
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui.button("↻ Actualiser").clicked() {
                    fetch_products(self.tx.clone(), self.token.clone());
                }
            });
        });
        let mut cats: Vec<String> = {
            let mut s: std::collections::BTreeSet<String> =
                self.products.iter().map(|p| p.category.clone()).collect();
            s.remove("");
            s.into_iter().collect()
        };
        cats.dedup();
        ui.horizontal_wrapped(|ui| {
            if ui.selectable_label(self.category.is_none(), "Tout").clicked() {
                self.category = None;
            }
            for c in &cats {
                let sel = self.category.as_deref() == Some(c.as_str());
                if ui.selectable_label(sel, c).clicked() {
                    self.category = Some(c.clone());
                }
            }
        });
        ui.separator();

        let search = self.search.to_lowercase();
        let cat = self.category.clone();
        let items: Vec<Product> = self
            .products
            .iter()
            .filter(|p| {
                let ok_search = search.is_empty() || p.name.to_lowercase().contains(&search);
                let ok_cat = cat.as_ref().map_or(true, |c| *c == p.category);
                ok_search && ok_cat
            })
            .cloned()
            .collect();

        egui::ScrollArea::vertical().show(ui, |ui| {
            if items.is_empty() {
                empty_state(ui, "🛒", "Aucun produit", "Aucun produit ne correspond à votre recherche.");
            }
            for p in &items {
                let p = p.clone();
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        self.product_thumb(ui, p.image_url.as_deref(), 56.0);
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(&p.name).strong());
                            ui.label(
                                egui::RichText::new(format!("{} · {}", p.category, cents(p.price_cents)))
                                    .color(TEXT_MUTED)
                                    .size(12.0),
                            );
                            if let Some(d) = &p.description {
                                if !d.is_empty() {
                                    ui.label(egui::RichText::new(d).size(11.0).color(TEXT_MUTED));
                                }
                            }
                            if !p.available {
                                ui.label(
                                    egui::RichText::new("Indisponible").color(RED).size(11.0),
                                );
                            }
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if p.available && !supplier {
                                if ui.button("＋ Ajouter").clicked() {
                                    self.add_to_cart(&p);
                                }
                            }
                        });
                    });
                });
                ui.add_space(6.0);
            }
        });
    }

    fn ui_cart(&mut self, ui: &mut egui::Ui) {
        if self.cart.is_empty() {
            empty_state(ui, "🛒", "Panier vide", "Ajoutez des produits depuis la boutique.");
            return;
        }
        let mut total: i64 = 0;
        let mut remove: Option<usize> = None;
        let mut bump: Option<usize> = None;
        egui::ScrollArea::vertical().show(ui, |ui| {
            for (i, line) in self.cart.iter_mut().enumerate() {
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(&line.product.name).strong());
                            ui.label(
                                egui::RichText::new(cents(line.product.price_cents))
                                    .color(TEXT_MUTED)
                                    .size(12.0),
                            );
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(
                                egui::RichText::new(cents(line.product.price_cents * line.qty))
                                    .strong(),
                            );
                            if ui.button("🗑").clicked() {
                                remove = Some(i);
                            }
                            if ui.button("＋").clicked() {
                                bump = Some(i);
                            }
                            ui.label(format!("{}", line.qty));
                            if ui.button("－").clicked() && line.qty > 1 {
                                line.qty -= 1;
                            }
                        });
                    });
                });
                ui.add_space(6.0);
                total += line.product.price_cents * line.qty;
            }
        });
        if let Some(i) = remove {
            self.cart.remove(i);
        }
        if let Some(i) = bump {
            if let Some(l) = self.cart.get_mut(i) {
                l.qty += 1;
            }
        }

        ui.add_space(8.0);
        card(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new("Total").strong());
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(
                        egui::RichText::new(cents(total))
                            .size(18.0)
                            .strong()
                            .color(ORANGE),
                    );
                });
            });
        });

        ui.add_space(8.0);
        section_title(ui, "Livraison");
        card(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label("Adresse");
                ui.add(
                    egui::TextEdit::singleline(&mut self.order_address)
                        .desired_width(f32::INFINITY)
                        .hint_text("3 à 200 caractères"),
                );
            });
            ui.horizontal(|ui| {
                ui.label("Téléphone");
                ui.add(
                    egui::TextEdit::singleline(&mut self.order_phone)
                        .desired_width(f32::INFINITY)
                        .hint_text("6 à 30 caractères"),
                );
            });
            ui.label("Note (facultatif)");
            ui.add(
                egui::TextEdit::multiline(&mut self.order_note)
                    .desired_rows(2)
                    .desired_width(f32::INFINITY),
            );
        });

        ui.add_space(8.0);
        let label = format!("Passer la commande · {}", cents(total));
        if ui
            .add(egui::Button::new(label).fill(ORANGE).min_size(egui::vec2(0.0, 34.0)))
            .clicked()
        {
            let address = self.order_address.trim().to_string();
            let phone = self.order_phone.trim().to_string();
            let note = self.order_note.trim().to_string();
            if address.chars().count() < 3 {
                self.set_notice("Adresse : 3 caractères minimum.");
                return;
            }
            if phone.chars().count() < 6 {
                self.set_notice("Téléphone : 6 caractères minimum.");
                return;
            }
            let items: Vec<OrderLine> = self
                .cart
                .iter()
                .map(|l| OrderLine {
                    product_id: l.product.id,
                    qty: l.qty,
                })
                .collect();
            if let Some(t) = self.token.clone() {
                place_order(self.tx.clone(), t, items, address, phone, note);
            }
        }
    }

    fn order_card(&mut self, ui: &mut egui::Ui, o: &Order) {
        let expanded = self.expanded_order == Some(o.id);
        let supplier = self.is_supplier();
        let token = self.token.clone();
        let tx = self.tx.clone();
        card(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new(format!("#{}", o.id)).strong());
                ui.label(
                    egui::RichText::new(status_fr(&o.status)).color(status_color(&o.status)),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(egui::RichText::new(cents(o.total_cents)).strong().color(ORANGE));
                    if ui
                        .button(if expanded { "Masquer ▴" } else { "Détails ▾" })
                        .clicked()
                    {
                        self.expanded_order = if expanded { None } else { Some(o.id) };
                    }
                });
            });
            if let Some(c) = &o.customer {
                if let Some(n) = &c.name {
                    ui.label(egui::RichText::new(n).color(TEXT_MUTED).size(12.0));
                }
            }
            ui.label(
                egui::RichText::new(
                    o.items
                        .iter()
                        .map(|i| format!("{}× {}", i.qty, i.name))
                        .collect::<Vec<_>>()
                        .join(", "),
                )
                .size(12.0),
            );

            if expanded {
                ui.separator();
                if let Some(a) = &o.address {
                    if !a.is_empty() {
                        ui.label(format!("📍 {}", a));
                    }
                }
                if let Some(p) = &o.phone {
                    if !p.is_empty() {
                        ui.label(format!("📞 {}", p));
                    }
                }
                if let Some(n) = &o.note {
                    if !n.is_empty() {
                        ui.label(egui::RichText::new(format!("📝 {}", n)).color(TEXT_MUTED));
                    }
                }
                if let Some(t) = &o.created_at {
                    ui.label(egui::RichText::new(format!("🕒 {}", t)).color(TEXT_MUTED).size(11.0));
                }
                ui.add_space(4.0);
                for it in &o.items {
                    ui.label(
                        egui::RichText::new(format!(
                            "• {} × {} = {}",
                            it.name,
                            it.qty,
                            cents(it.price_cents * it.qty)
                        ))
                        .size(12.0)
                        .color(TEXT_MUTED),
                    );
                }

                let next = next_statuses(&o.status);
                if supplier && !next.is_empty() {
                    ui.add_space(6.0);
                    ui.horizontal_wrapped(|ui| {
                        for st in next {
                            let danger = *st == "refused";
                            let mut btn = egui::Button::new(status_action(st));
                            if danger {
                                btn = btn.fill(egui::Color32::from_rgb(90, 30, 30));
                            }
                            if ui.add(btn).clicked() {
                                if let Some(t) = token.clone() {
                                    update_order_status(tx.clone(), t, o.id, (*st).to_string());
                                }
                            }
                        }
                    });
                }
            }
        });
    }

    fn ui_orders(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            if ui.button("↻ Rafraîchir").clicked() {
                self.reload_orders();
            }
            ui.label(
                egui::RichText::new(format!("{} commande(s)", self.orders.len()))
                    .color(TEXT_MUTED)
                    .size(12.0),
            );
        });
        ui.add_space(4.0);
        if self.orders.is_empty() {
            empty_state(
                ui,
                "📋",
                "Aucune commande",
                "Les nouvelles commandes apparaîtront ici automatiquement.",
            );
            return;
        }
        let orders = self.orders.clone();
        egui::ScrollArea::vertical().show(ui, |ui| {
            for o in &orders {
                self.order_card(ui, o);
                ui.add_space(6.0);
            }
        });
    }

    fn ui_profile(&mut self, ui: &mut egui::Ui) {
        if let Some(u) = self.user.clone() {
            card(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("👤").size(28.0));
                    ui.vertical(|ui| {
                        ui.label(egui::RichText::new(&u.name).size(18.0).strong());
                        ui.label(
                            egui::RichText::new(format!("Rôle : {}", status_role(&u.role)))
                                .color(TEXT_MUTED)
                                .size(12.0),
                        );
                        if let Some(p) = &u.provider {
                            ui.label(
                                egui::RichText::new(format!("Connexion : {}", p))
                                    .color(TEXT_MUTED)
                                    .size(11.0),
                            );
                        }
                    });
                });
            });
            ui.add_space(8.0);
            if u.is_supplier() {
                card(ui, |ui| {
                    ui.label(egui::RichText::new("Espace fournisseur actif").strong().color(GREEN));
                    ui.label(
                        egui::RichText::new("Vous gérez les commandes, produits, catégories et finances.")
                            .color(TEXT_MUTED)
                            .size(12.0),
                    );
                    ui.add_space(6.0);
                    if ui
                        .add(
                            egui::Button::new("Quitter le mode fournisseur")
                                .fill(egui::Color32::from_rgb(90, 30, 30)),
                        )
                        .clicked()
                    {
                        if let Some(t) = self.token.clone() {
                            leave_supplier(self.tx.clone(), t);
                        }
                    }
                });
            } else {
                card(ui, |ui| {
                    ui.label(egui::RichText::new("Devenir fournisseur").strong());
                    ui.label(
                        egui::RichText::new("Entrez votre code d'accès")
                            .color(TEXT_MUTED)
                            .size(12.0),
                    );
                    ui.horizontal(|ui| {
                        ui.add(
                            egui::TextEdit::singleline(&mut self.supplier_code)
                                .hint_text("CODE-XXXX"),
                        );
                        let code = self.supplier_code.clone();
                        if ui.button("Valider").clicked() && !code.trim().is_empty() {
                            if let Some(t) = self.token.clone() {
                                enter_supplier(self.tx.clone(), t, code);
                            }
                        }
                    });
                });
            }
        }
    }

    fn ui_admin(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            for (i, label) in ["Commandes", "Produits", "Catégories"].iter().enumerate() {
                if ui.selectable_label(self.admin_tab == i, *label).clicked() {
                    self.admin_tab = i;
                    match i {
                        1 => fetch_products(self.tx.clone(), self.token.clone()),
                        2 => fetch_categories(self.tx.clone(), self.token.clone()),
                        _ => self.reload_orders(),
                    }
                }
            }
        });
        ui.separator();
        match self.admin_tab {
            0 => {
                ui.horizontal(|ui| {
                    if ui.button("↻ Rafraîchir").clicked() {
                        self.reload_orders();
                    }
                    let attente = self
                        .orders
                        .iter()
                        .filter(|o| o.status == "pending")
                        .count();
                    if attente > 0 {
                        ui.label(
                            egui::RichText::new(format!("{} en attente", attente))
                                .color(ORANGE)
                                .size(12.0),
                        );
                    }
                });
                ui.add_space(4.0);
                if self.orders.is_empty() {
                    empty_state(
                        ui,
                        "📋",
                        "Aucune commande",
                        "Les commandes clients apparaîtront ici.",
                    );
                    return;
                }
                let orders = self.orders.clone();
                egui::ScrollArea::vertical().show(ui, |ui| {
                    for o in &orders {
                        self.order_card(ui, o);
                        ui.add_space(6.0);
                    }
                });
            }
            1 => self.ui_admin_products(ui),
            _ => self.ui_admin_categories(ui),
        }
    }

    fn ui_admin_products(&mut self, ui: &mut egui::Ui) {
        let editing = self.editing_id;
        let cat_names: Vec<String> = self.categories.iter().map(|c| c.name.clone()).collect();
        card(ui, |ui| {
            ui.label(
                egui::RichText::new(if editing.is_some() { "Modifier le produit" } else { "Nouveau produit" })
                    .strong()
                    .color(if editing.is_some() { ORANGE } else { egui::Color32::WHITE }),
            );
            ui.add_space(4.0);
            ui.label("Nom");
            ui.add(egui::TextEdit::singleline(&mut self.new_prod_name).desired_width(f32::INFINITY));
            ui.horizontal(|ui| {
                ui.label("Prix");
                ui.add(egui::TextEdit::singleline(&mut self.new_prod_price).hint_text("12,50"));
                ui.label("Coût");
                ui.add(egui::TextEdit::singleline(&mut self.new_prod_cost).hint_text("6,00"));
            });
            ui.horizontal(|ui| {
                ui.label("Catégorie");
                egui::ComboBox::from_id_salt("prod_cat")
                    .selected_text(if self.new_prod_category.is_empty() {
                        "Choisir…".to_string()
                    } else {
                        self.new_prod_category.clone()
                    })
                    .show_ui(ui, |ui| {
                        for c in &cat_names {
                            ui.selectable_value(&mut self.new_prod_category, c.clone(), c);
                        }
                    });
            });
            ui.label("Description");
            ui.add(
                egui::TextEdit::multiline(&mut self.new_prod_desc)
                    .desired_rows(2)
                    .desired_width(f32::INFINITY),
            );
            ui.horizontal(|ui| {
                ui.checkbox(&mut self.new_prod_available, "Disponible");
            });

            // Photo
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.label("Photo");
                ui.add(
                    egui::TextEdit::singleline(&mut self.image_path)
                        .desired_width(220.0)
                        .hint_text("chemin de l'image"),
                );
                if ui.button("Parcourir…").clicked() {
                    if let Some(p) = rfd::FileDialog::new()
                        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"])
                        .pick_file()
                    {
                        self.image_path = p.to_string_lossy().into_owned();
                    }
                }
                let path = self.image_path.clone();
                if ui.add_enabled(!path.is_empty(), egui::Button::new("Envoyer")).clicked() {
                    if let Some(t) = self.token.clone() {
                        upload_image(self.tx.clone(), t, path);
                    }
                }
            });
            if !self.new_prod_image.is_empty() {
                ui.label(
                    egui::RichText::new(format!("✓ {}", self.new_prod_image))
                        .size(11.0)
                        .color(GREEN),
                );
            }

            ui.add_space(6.0);
            ui.horizontal(|ui| {
                let ok = !self.new_prod_name.trim().is_empty() && !self.new_prod_category.trim().is_empty();
                let label = if editing.is_some() { "💾 Enregistrer" } else { "＋ Ajouter" };
                if ui.add_enabled(ok, egui::Button::new(label).fill(ORANGE)).clicked() {
                    let name = self.new_prod_name.trim().to_string();
                    let price = euros_to_cents(&self.new_prod_price);
                    let cost = euros_to_cents(&self.new_prod_cost);
                    let cat = self.new_prod_category.trim().to_string();
                    let desc = if self.new_prod_desc.trim().is_empty() {
                        None
                    } else {
                        Some(self.new_prod_desc.trim().to_string())
                    };
                    let img = if self.new_prod_image.trim().is_empty() {
                        None
                    } else {
                        Some(self.new_prod_image.trim().to_string())
                    };
                    let avail = self.new_prod_available;
                    if let Some(t) = self.token.clone() {
                        if let Some(id) = editing {
                            update_product(self.tx.clone(), t, id, name, desc, price, cost, cat, img, avail);
                        } else {
                            create_product(self.tx.clone(), t, name, desc, price, cost, cat, img, avail);
                        }
                    }
                    self.reset_product_form();
                }
                if editing.is_some() && ui.button("Annuler").clicked() {
                    self.reset_product_form();
                }
            });
        });
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            if ui.button("↻ Rafraîchir").clicked() {
                fetch_products(self.tx.clone(), self.token.clone());
            }
            ui.label(
                egui::RichText::new(format!("{} produit(s)", self.products.len()))
                    .color(TEXT_MUTED)
                    .size(12.0),
            );
        });
        let products = self.products.clone();
        egui::ScrollArea::vertical().show(ui, |ui| {
            if products.is_empty() {
                empty_state(ui, "🍽️", "Aucun produit", "Ajoutez votre premier produit ci-dessus.");
            }
            for p in &products {
                let p = p.clone();
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        self.product_thumb(ui, p.image_url.as_deref(), 48.0);
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(&p.name).strong());
                            ui.label(
                                egui::RichText::new(format!(
                                    "{} · vente {} · coût {}",
                                    p.category,
                                    cents(p.price_cents),
                                    cents(p.cost_cents)
                                ))
                                .color(TEXT_MUTED)
                                .size(12.0),
                            );
                            if !p.available {
                                ui.label(egui::RichText::new("Indisponible").color(RED).size(11.0));
                            }
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if ui.button("🗑").clicked() {
                                if let Some(t) = self.token.clone() {
                                    delete_product(self.tx.clone(), t, p.id);
                                }
                                if self.editing_id == Some(p.id) {
                                    self.reset_product_form();
                                }
                            }
                            if ui.button("✏️ Modifier").clicked() {
                                self.editing_id = Some(p.id);
                                self.new_prod_name = p.name.clone();
                                self.new_prod_price = format!("{:.2}", p.price_cents as f64 / 100.0);
                                self.new_prod_cost = format!("{:.2}", p.cost_cents as f64 / 100.0);
                                self.new_prod_category = p.category.clone();
                                self.new_prod_desc = p.description.clone().unwrap_or_default();
                                self.new_prod_available = p.available;
                                self.new_prod_image = p.image_url.clone().unwrap_or_default();
                                self.image_path.clear();
                            }
                        });
                    });
                });
                ui.add_space(6.0);
            }
        });
    }

    fn ui_admin_categories(&mut self, ui: &mut egui::Ui) {
        card(ui, |ui| {
            ui.label(egui::RichText::new("Nouvelle catégorie").strong());
            ui.horizontal(|ui| {
                ui.add(egui::TextEdit::singleline(&mut self.new_cat).desired_width(240.0));
                let name = self.new_cat.trim().to_string();
                if ui.add_enabled(!name.is_empty(), egui::Button::new("＋ Ajouter")).clicked() {
                    if let Some(t) = self.token.clone() {
                        create_category(self.tx.clone(), t, name);
                    }
                    self.new_cat.clear();
                }
            });
        });
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            if ui.button("↻ Rafraîchir").clicked() {
                fetch_categories(self.tx.clone(), self.token.clone());
            }
            ui.label(
                egui::RichText::new(format!("{} catégorie(s)", self.categories.len()))
                    .color(TEXT_MUTED)
                    .size(12.0),
            );
        });
        let cats = self.categories.clone();
        egui::ScrollArea::vertical().show(ui, |ui| {
            if cats.is_empty() {
                empty_state(ui, "🏷️", "Aucune catégorie", "Créez une catégorie ci-dessus.");
            }
            for c in &cats {
                let c = c.clone();
                let renaming = self.rename_id == Some(c.id);
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new(&c.name).strong());
                        ui.label(
                            egui::RichText::new(format!("{} produit(s)", c.products_count))
                                .color(TEXT_MUTED)
                                .size(12.0),
                        );
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if ui.button("🗑").clicked() {
                                if let Some(t) = self.token.clone() {
                                    delete_category(self.tx.clone(), t, c.id);
                                }
                                if self.rename_id == Some(c.id) {
                                    self.rename_id = None;
                                }
                            }
                            if ui.button("✏️ Renommer").clicked() {
                                self.rename_id = Some(c.id);
                                self.rename_buf = c.name.clone();
                            }
                        });
                    });
                    if renaming {
                        ui.horizontal(|ui| {
                            ui.add(
                                egui::TextEdit::singleline(&mut self.rename_buf)
                                    .desired_width(240.0),
                            );
                            let new_name = self.rename_buf.trim().to_string();
                            if ui
                                .add_enabled(!new_name.is_empty(), egui::Button::new("Valider"))
                                .clicked()
                            {
                                if let Some(t) = self.token.clone() {
                                    rename_category(self.tx.clone(), t, c.id, new_name);
                                }
                                self.rename_id = None;
                            }
                            if ui.button("Annuler").clicked() {
                                self.rename_id = None;
                            }
                        });
                    }
                });
                ui.add_space(6.0);
            }
        });
    }

    fn ui_finances(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            if ui.button("↻ Rafraîchir").clicked() {
                if let Some(t) = self.token.clone() {
                    fetch_summary(self.tx.clone(), t.clone());
                    fetch_expenses(self.tx.clone(), t);
                }
            }
            ui.label(egui::RichText::new("Espace Finances").color(TEXT_MUTED).size(12.0));
        });
        ui.add_space(4.0);
        match &self.summary {
            Some(s) => {
                ui.horizontal_wrapped(|ui| {
                    for (label, val, sub) in [
                        ("Revenus", s.revenue_cents, format!("{} commande(s)", s.orders)),
                        ("Coûts", s.cost_cents, format!("{} unité(s)", s.units)),
                        ("Marge brute", s.gross_margin_cents, "Revenus − coûts".to_string()),
                        ("Dépenses", s.expenses_cents, format!("{} ligne(s)", s.expense_count)),
                        ("Résultat net", s.net_cents, "Marge − dépenses".to_string()),
                    ] {
                        card(ui, |ui| {
                            ui.set_min_width(140.0);
                            ui.label(egui::RichText::new(label).size(11.0).color(TEXT_MUTED));
                            ui.label(
                                egui::RichText::new(cents(val))
                                    .size(16.0)
                                    .strong()
                                    .color(if label == "Résultat net" { ORANGE } else { egui::Color32::WHITE }),
                            );
                            ui.label(egui::RichText::new(sub).size(10.0).color(TEXT_MUTED));
                        });
                    }
                });
            }
            None => {
                card(ui, |ui| {
                    ui.label(egui::RichText::new("Chargement du résumé…").color(TEXT_MUTED));
                });
            }
        }

        ui.add_space(8.0);
        section_title(ui, "Nouvelle dépense");
        card(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label("Libellé");
                ui.add(egui::TextEdit::singleline(&mut self.new_exp_label).desired_width(f32::INFINITY));
            });
            ui.horizontal(|ui| {
                ui.label("Montant");
                ui.add(egui::TextEdit::singleline(&mut self.new_exp_amount).hint_text("25,00"));
                ui.label("Date");
                ui.add(egui::TextEdit::singleline(&mut self.new_exp_date).hint_text("2026-11-19"));
            });
            let label = self.new_exp_label.trim().to_string();
            let amount = euros_to_cents(&self.new_exp_amount);
            if ui
                .add_enabled(!label.is_empty(), egui::Button::new("＋ Ajouter"))
                .clicked()
            {
                let date = if self.new_exp_date.trim().is_empty() {
                    None
                } else {
                    Some(self.new_exp_date.trim().to_string())
                };
                if let Some(t) = self.token.clone() {
                    create_expense(self.tx.clone(), t, label, amount, date);
                }
                self.new_exp_label.clear();
                self.new_exp_amount.clear();
                self.new_exp_date.clear();
            }
        });

        ui.add_space(8.0);
        section_title(ui, "Dépenses");
        if self.expenses.is_empty() {
            empty_state(
                ui,
                "💳",
                "Aucune dépense",
                "Ajoutez vos charges pour calculer le résultat net.",
            );
            return;
        }
        let expenses = self.expenses.clone();
        egui::ScrollArea::vertical().show(ui, |ui| {
            for e in &expenses {
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(&e.label).strong());
                            ui.label(
                                egui::RichText::new(e.date.clone().unwrap_or_else(|| "—".into()))
                                    .color(TEXT_MUTED)
                                    .size(11.0),
                            );
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(
                                egui::RichText::new(cents(e.amount_cents)).color(RED).strong(),
                            );
                            if ui.button("🗑").clicked() {
                                if let Some(t) = self.token.clone() {
                                    delete_expense(self.tx.clone(), t, e.id);
                                }
                            }
                        });
                    });
                });
                ui.add_space(6.0);
            }
        });
    }

    fn ui_chat(&mut self, ui: &mut egui::Ui) {
        if self.conversations.is_empty() {
            if ui.button("↻ Charger les conversations").clicked() {
                if let Some(t) = self.token.clone() {
                    fetch_conversations(self.tx.clone(), t);
                }
            }
            ui.add_space(6.0);
        }
        let my_id = self.user.as_ref().map(|u| u.id);
        let token = self.token.clone();
        let tx = self.tx.clone();
        let mut open: Option<i64> = None;
        let mut send: Option<String> = None;

        ui.columns(2, |cols| {
            // ---- Liste ----
            cols[0].vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("Conversations").strong());
                    if ui.button("↻").clicked() {
                        if let Some(t) = token.clone() {
                            fetch_conversations(tx.clone(), t);
                        }
                    }
                });
                ui.add_space(4.0);
                egui::ScrollArea::vertical().max_height(620.0).show(ui, |ui| {
                    if self.conversations.is_empty() {
                        ui.label(
                            egui::RichText::new("Aucune conversation pour le moment.")
                                .color(TEXT_MUTED)
                                .size(12.0),
                        );
                    }
                    for c in &self.conversations {
                        let c = c.clone();
                        let sel = self.chat_id == Some(c.id);
                        let name = c
                            .customer
                            .as_ref()
                            .and_then(|x| x.name.clone())
                            .unwrap_or_else(|| format!("Client #{}", c.id));
                        let preview = c
                            .last_message
                            .as_ref()
                            .and_then(|m| m.body.clone())
                            .unwrap_or_else(|| "…".into());
                        card(ui, |ui| {
                            ui.horizontal(|ui| {
                                let name_label = ui.selectable_label(
                                    sel,
                                    egui::RichText::new(&name).strong().size(13.0),
                                );
                                if name_label.clicked() {
                                    open = Some(c.id);
                                }
                                if c.unread_count > 0 {
                                    ui.label(
                                        egui::RichText::new(format!("{}", c.unread_count))
                                            .color(egui::Color32::WHITE)
                                            .strong()
                                            .size(11.0),
                                    );
                                }
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        ui.label(
                                            egui::RichText::new(short_time(&c.updated_at))
                                                .color(TEXT_MUTED)
                                                .size(10.0),
                                        );
                                    },
                                );
                            });
                            let prev_label = ui.add(
                                egui::Label::new(
                                    egui::RichText::new(preview).color(TEXT_MUTED).size(11.0),
                                )
                                .sense(egui::Sense::click()),
                            );
                            if prev_label.clicked() {
                                open = Some(c.id);
                            }
                        });
                        ui.add_space(6.0);
                    }
                });
            });

            cols[1].vertical(|ui| {
                if let Some(id) = self.chat_id {
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new(format!("Conversation #{}", id)).strong());
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if ui.button("↻").clicked() {
                                if let Some(t) = token.clone() {
                                    fetch_messages(tx.clone(), t, id);
                                }
                            }
                        });
                    });
                    ui.separator();
                    egui::ScrollArea::vertical()
                        .stick_to_bottom(true)
                        .max_height(500.0)
                        .show(ui, |ui| {
                            if self.chat_messages.is_empty() {
                                ui.label(
                                    egui::RichText::new("Aucun message. Envoyez le premier !")
                                        .color(TEXT_MUTED)
                                        .size(12.0),
                                );
                            }
                            for m in &self.chat_messages {
                                let m = m.clone();
                                let mine = m.sender_id == my_id;
                                ui.horizontal(|ui| {
                                    if mine {
                                        ui.with_layout(
                                            egui::Layout::right_to_left(egui::Align::Center),
                                            |ui| {
                                                chat_bubble(ui, &m, mine);
                                            },
                                        );
                                    } else {
                                        chat_bubble(ui, &m, mine);
                                    }
                                });
                                ui.add_space(2.0);
                            }
                        });
                    ui.add_space(6.0);
                    ui.horizontal(|ui| {
                        let resp = ui.add(
                            egui::TextEdit::singleline(&mut self.chat_input)
                                .desired_width(f32::INFINITY)
                                .hint_text("Votre message…"),
                        );
                        let enter = resp.lost_focus()
                            && ui.input(|i| i.key_pressed(egui::Key::Enter))
                            && !self.chat_input.trim().is_empty();
                        if (ui.button("Envoyer").clicked() || enter) && !self.chat_input.trim().is_empty()
                        {
                            send = Some(self.chat_input.clone());
                        }
                    });
                } else {
                    empty_state(
                        ui,
                        "💬",
                        "Aucune conversation ouverte",
                        "Sélectionnez une conversation à gauche.",
                    );
                }
            });
        });

        if let Some(id) = open {
            self.chat_id = Some(id);
            self.chat_messages.clear();
            if let Some(t) = token.clone() {
                fetch_messages(tx.clone(), t.clone(), id);
                mark_read(t, id);
            }
        }
        if let Some(body) = send {
            if let Some(id) = self.chat_id {
                if let Some(t) = self.token.clone() {
                    send_message(self.tx.clone(), t, id, body);
                }
                self.chat_input.clear();
            }
        }
    }
}

fn status_role(r: &str) -> &'static str {
    match r {
        "supplier" => "Fournisseur",
        _ => "Client",
    }
}

fn chat_bubble(ui: &mut egui::Ui, m: &ChatMessage, mine: bool) {
    egui::Frame::new()
        .fill(if mine { ORANGE } else { SURFACE2 })
        .corner_radius(egui::CornerRadius::same(10))
        .inner_margin(egui::Margin::same(8))
        .show(ui, |ui| {
            ui.set_max_width(440.0);
            if !mine {
                if let Some(n) = &m.sender_name {
                    ui.label(egui::RichText::new(n).size(10.0).color(egui::Color32::WHITE));
                }
            }
            ui.label(egui::RichText::new(&m.body).color(egui::Color32::WHITE));
            ui.label(
                egui::RichText::new(short_time(&m.created_at))
                    .size(9.0)
                    .color(egui::Color32::from_rgb(235, 235, 235)),
            );
        });
}

impl eframe::App for ShopApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        while let Ok(m) = self.rx.try_recv() {
            match m {
                Msg::LoginOk(u, t) => {
                    self.user = Some(u);
                    self.token = Some(t);
                    self.busy = false;
                    self.screen = Screen::Boutique;
                    self.set_notice("Connecté");
                    fetch_products(self.tx.clone(), self.token.clone());
                    fetch_categories(self.tx.clone(), self.token.clone());
                    self.reload_orders();
                    self.last_poll = Some(Instant::now());
                }
                Msg::LoginErr(e) => {
                    self.busy = false;
                    self.set_notice(e);
                }
                Msg::RoleUpdated(u) => {
                    self.user = Some(u);
                    self.screen = Screen::Profile;
                    self.set_notice(
                        if self.is_supplier() {
                            "Mode fournisseur activé"
                        } else {
                            "Mode fournisseur désactivé"
                        },
                    );
                    if !self.is_supplier() {
                        self.admin_tab = 0;
                        self.conversations.clear();
                        self.chat_id = None;
                    }
                }
                Msg::Products(p) => self.products = p,
                Msg::Orders(o) => self.orders = o,
                Msg::Summary(s) => self.summary = Some(s),
                Msg::Expenses(e) => self.expenses = e,
                Msg::Categories(c) => self.categories = c,
                Msg::Conversations(c) => self.conversations = c,
                Msg::Messages(id, msgs) => {
                    if self.chat_id == Some(id) {
                        self.chat_messages = msgs;
                    }
                }
                Msg::MessageSent => {
                    if let Some(id) = self.chat_id {
                        if let Some(t) = self.token.clone() {
                            fetch_messages(self.tx.clone(), t, id);
                        }
                    }
                }
                Msg::OrderPlaced => {
                    self.cart.clear();
                    self.order_address.clear();
                    self.order_phone.clear();
                    self.order_note.clear();
                    self.set_notice("Commande envoyée au commerçant !");
                    self.screen = Screen::Orders;
                    self.reload_orders();
                }
                Msg::ImageUploaded(url) => {
                    self.new_prod_image = url;
                    self.image_path.clear();
                    self.set_notice("Photo envoyée");
                }
                Msg::ImageLoaded(url, img) => {
                    let tex = ctx.load_texture(url.clone(), img, egui::TextureOptions::LINEAR);
                    self.images.insert(url, tex);
                    ctx.request_repaint();
                }
                Msg::UpdateAvailable(v, u) => {
                    self.update_version = Some(v);
                    self.update_url = Some(u);
                }
                Msg::ExitApp => {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                }
                Msg::Notice(n) => self.set_notice(n),
                Msg::Error(e) => {
                    self.busy = false;
                    self.set_notice(e);
                }
            }
        }

        // ---- Rafraîchissement automatique (chat / commandes / finances) ----
        if self.token.is_some() {
            let due = self
                .last_poll
                .map(|t| t.elapsed() >= Duration::from_secs(4))
                .unwrap_or(true);
            if due {
                match self.screen {
                    Screen::Boutique => fetch_products(self.tx.clone(), self.token.clone()),
                    Screen::Orders => self.reload_orders(),
                    Screen::Chat => {
                        if let Some(t) = self.token.clone() {
                            fetch_conversations(self.tx.clone(), t.clone());
                            if let Some(id) = self.chat_id {
                                fetch_messages(self.tx.clone(), t, id);
                            }
                        }
                    }
                    Screen::Admin => match self.admin_tab {
                        0 => self.reload_orders(),
                        1 => fetch_products(self.tx.clone(), self.token.clone()),
                        _ => fetch_categories(self.tx.clone(), self.token.clone()),
                    },
                    Screen::Finances => {
                        if let Some(t) = self.token.clone() {
                            fetch_summary(self.tx.clone(), t.clone());
                            fetch_expenses(self.tx.clone(), t);
                        }
                    }
                    _ => {}
                }
                self.last_poll = Some(Instant::now());
            }
        }

        // ---- Barre supérieure ----
        egui::TopBottomPanel::top("top").show(ctx, |ui| {
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new("🛍️ ShopTaBouffe")
                        .size(18.0)
                        .strong()
                        .color(ORANGE),
                );
                if let Some(u) = &self.user {
                    ui.label(egui::RichText::new(format!("  ·  {}", u.name)).color(TEXT_MUTED));
                    if u.is_supplier() {
                        ui.label(
                            egui::RichText::new("· fournisseur")
                                .color(ORANGE)
                                .size(12.0),
                        );
                    }
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if self.user.is_some() && ui.button("Déconnexion").clicked() {
                        self.user = None;
                        self.token = None;
                        self.conversations.clear();
                        self.chat_id = None;
                        self.orders.clear();
                        self.screen = Screen::Login;
                    }
                    ui.label(
                        egui::RichText::new(format!("v{}", APP_VERSION))
                            .color(TEXT_MUTED)
                            .size(11.0),
                    );
                });
            });

            // Bannière auto-update
            if let (Some(v), Some(u)) = (self.update_version.clone(), self.update_url.clone()) {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new(format!("⬆️ Mise à jour disponible : v{}", v))
                            .color(ORANGE)
                            .strong(),
                    );
                    if ui.button("Télécharger et installer").clicked() {
                        let tx = self.tx.clone();
                        thread::spawn(move || {
                            let path = std::env::temp_dir().join("ShopTaBouffe-Update.exe");
                            match reqwest::blocking::Client::new().get(&u).send() {
                                Ok(r) => {
                                    if let Ok(bytes) = r.bytes() {
                                        if std::fs::write(&path, &bytes).is_ok() {
                                            // On referme l'application (sinon le .exe est verrouillé),
                                            // puis lance l'installateur 2 s plus tard, sans console.
                                            let _ = tx.send(Msg::Notice(
                                                "Mise à jour : l'application va redémarrer…".into(),
                                            ));
                                            let _ = tx.send(Msg::ExitApp);
                                            use std::os::windows::process::CommandExt;
                                            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                                            let line = format!(
                                                "timeout /t 2 /nobreak >nul 2>&1 && start \"\" \"{}\"",
                                                path.display()
                                            );
                                            let _ = std::process::Command::new("cmd")
                                                .arg("/C")
                                                .arg(line)
                                                .creation_flags(CREATE_NO_WINDOW)
                                                .spawn();
                                        } else {
                                            let _ = tx.send(Msg::Error(
                                                "Écriture du fichier impossible.".into(),
                                            ));
                                        }
                                    }
                                }
                                Err(e) => {
                                    let _ = tx.send(Msg::Error(e.to_string()));
                                }
                            }
                        });
                    }
                    if ui.button("Plus tard").clicked() {
                        self.update_version = None;
                        self.update_url = None;
                    }
                });
            }

            if self.user.is_some() {
                ui.add_space(2.0);
                ui.horizontal_wrapped(|ui| {
                    let cart_qty: i64 = self.cart.iter().map(|l| l.qty).sum();
                    let supplier = self.is_supplier();
                    let can_chat = self.user.as_ref().map(|u| u.can_chat()).unwrap_or(false);
                    let mut tabs: Vec<(String, Screen)> = vec![
                        ("Boutique".into(), Screen::Boutique),
                        (format!("Panier ({})", cart_qty), Screen::Cart),
                        ("Commandes".into(), Screen::Orders),
                        ("Profil".into(), Screen::Profile),
                    ];
                    if supplier {
                        tabs.push(("Produits".into(), Screen::Admin));
                        tabs.push(("Finances".into(), Screen::Finances));
                    }
                    if can_chat {
                        tabs.push(("Messages".into(), Screen::Chat));
                    }
                    for (label, scr) in tabs {
                        if scr == Screen::Cart && supplier {
                            continue;
                        }
                        let selected = self.screen == scr;
                        if ui.selectable_label(selected, label).clicked() {
                            self.screen = scr;
                            self.on_screen_change();
                        }
                    }
                });
                ui.add_space(4.0);
            }
        });

        // ---- Bandeau de notification ----
        let expired = self
            .notice_at
            .map(|t| t.elapsed() >= Duration::from_secs(5))
            .unwrap_or(false);
        if expired {
            self.notice = None;
            self.notice_at = None;
        }
        if let Some(n) = self.notice.clone() {
            egui::TopBottomPanel::bottom("notice").show(ctx, |ui| {
                ui.add_space(4.0);
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("ℹ️ ").color(ORANGE));
                    ui.label(egui::RichText::new(n).color(egui::Color32::WHITE));
                });
                ui.add_space(4.0);
            });
        }

        egui::CentralPanel::default().show(ctx, |ui| match self.screen {
            Screen::Login => self.ui_login(ui),
            Screen::Boutique => self.ui_boutique(ui),
            Screen::Cart => self.ui_cart(ui),
            Screen::Orders => self.ui_orders(ui),
            Screen::Profile => self.ui_profile(ui),
            Screen::Admin => self.ui_admin(ui),
            Screen::Finances => self.ui_finances(ui),
            Screen::Chat => self.ui_chat(ui),
        });

        // Garde-fou : l'écran Chat n'est accessible qu'aux comptes autorisés.
        if self.screen == Screen::Chat {
            if let Some(u) = &self.user {
                if !u.can_chat() {
                    self.screen = Screen::Profile;
                    self.set_notice("Chat réservé aux comptes GitHub ou Google.");
                }
            }
        }

        ctx.request_repaint_after(Duration::from_secs(1));
    }
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([1240.0, 860.0]),
        ..Default::default()
    };
    eframe::run_native(
        "ShopTaBouffe",
        options,
        Box::new(|cc| {
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
        }),
    )
}
