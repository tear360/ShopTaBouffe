#![windows_subsystem = "windows"]

//! ShopTaBouffe — app Windows native (eframe/egui).
//! Interface calquée sur l'app Android (palette Theme.kt, top bar, bottom nav).
//! Zéro emoji : toutes les icônes sont dessinées au Painter (pas de glyph manquant).

use eframe::egui;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;
use std::time::{Duration, Instant};

const API_BASE: &str = "https://chorizo.dpdns.org/api";
const APP_VERSION: &str = "1.0.8";

/* ------------------------------------------------------- palette (Theme.kt) */

const BG: egui::Color32 = egui::Color32::from_rgb(11, 12, 17); // #0B0C11
const SURFACE: egui::Color32 = egui::Color32::from_rgb(22, 24, 31); // #16181F
const GREY: egui::Color32 = egui::Color32::from_rgb(31, 34, 43); // #1F222B
const TEXT: egui::Color32 = egui::Color32::from_rgb(243, 244, 248); // #F3F4F8
const MUTED: egui::Color32 = egui::Color32::from_rgb(155, 163, 178); // #9BA3B2
const ORANGE: egui::Color32 = egui::Color32::from_rgb(239, 108, 51); // #EF6C33
const GREEN: egui::Color32 = egui::Color32::from_rgb(52, 211, 153); // #34D399
const RED: egui::Color32 = egui::Color32::from_rgb(255, 107, 107); // #FF6B6B
const AMBER: egui::Color32 = egui::Color32::from_rgb(255, 194, 75); // #FFC24B
const BLUE: egui::Color32 = egui::Color32::from_rgb(61, 125, 216); // #3D7DD8
const PURPLE: egui::Color32 = egui::Color32::from_rgb(138, 92, 209); // #8A5CD1

/// Couleur translucide (style « chips » Material : pilule alpha ~14 %).
fn alpha(c: egui::Color32, a: u8) -> egui::Color32 {
    egui::Color32::from_rgba_unmultiplied(c.r(), c.g(), c.b(), a)
}

fn glass(a: u8) -> egui::Color32 {
    egui::Color32::from_white_alpha(a)
}

/* --------------------------------------------------------------- modèles */

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
    #[serde(rename = "imageUrl", default)]
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
    #[serde(rename = "createdAt", default)]
    created_at: Option<String>,
    #[serde(default)]
    items: Vec<OrderItem>,
    #[serde(default)]
    customer: Option<OrderCustomer>,
    #[serde(default)]
    phone: Option<String>,
    #[serde(default)]
    address: Option<String>,
    #[serde(default)]
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
    #[serde(default)]
    orders: i64,
    #[serde(default)]
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
    #[serde(default)]
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
    #[serde(default)]
    customer: Option<OrderCustomer>,
    #[serde(rename = "lastMessage", default)]
    last_message: Option<MsgPreview>,
    #[serde(rename = "unreadCount", default)]
    unread_count: i64,
    #[serde(rename = "updatedAt", default)]
    updated_at: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct MsgPreview {
    body: Option<String>,
    #[serde(rename = "createdAt", default)]
    created_at: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct ChatMessage {
    id: i64,
    body: String,
    #[serde(rename = "createdAt", default)]
    created_at: Option<String>,
    #[serde(rename = "senderId", default)]
    sender_id: Option<i64>,
    #[serde(rename = "senderName", default)]
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
    Catégories(Vec<Category>),
    Conversations(Vec<Conversation>),
    Messages(i64, Vec<ChatMessage>),
    MessageSent,
    OrderPlaced,
    ImageUploaded(String),
    ImageLoaded(String, egui::ColorImage),
    UpdateAvailable(String, String),
    Unauthorized,
    ExitApp,
    Error(String),
    Notice(String),
}

/* --------------------------------------------------------------- état */

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

    admin_tab: usize, // 0 produits, 1 catégories

    summary: Option<FinanceSummary>,
    expenses: Vec<Expense>,
    catégories: Vec<Category>,

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

/// Compare deux versions « X.Y.Z » : true si `newer` est strictement supérieur.
fn is_newer(newer: &str, current: &str) -> bool {
    fn tuple(v: &str) -> (u64, u64, u64) {
        let mut it = v.split('.').map(|p| {
            p.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        });
        (
            it.next().unwrap_or(0),
            it.next().unwrap_or(0),
            it.next().unwrap_or(0),
        )
    }
    tuple(newer) > tuple(current)
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
                            if let Some(a) = rel
                                .assets
                                .into_iter()
                                .find(|a| a.name.ends_with(".exe"))
                            {
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
            catégories: vec![],
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

/* ------------------------------------------------------------ couche HTTP */

/// Appel HTTP synchrone. Ok = corps (2xx). Err = (status, message FR).
/// Le 401 est isolé pour déclencher une déconnexion propre côté UI.
fn http_call(
    method: reqwest::Method,
    url: String,
    token: Option<String>,
    json: Option<serde_json::Value>,
    form: Option<reqwest::blocking::multipart::Form>,
) -> Result<String, (u16, String)> {
    let client = reqwest::blocking::Client::new();
    let mut req = client.request(method, &url);
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    if let Some(v) = json {
        req = req.json(&v);
    }
    if let Some(f) = form {
        req = req.multipart(f);
    }
    match req.send() {
        Ok(r) => {
            let status = r.status().as_u16();
            let text = r.text().unwrap_or_default();
            if (200..300).contains(&status) {
                Ok(text)
            } else {
                let msg = serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|v| {
                        v.get("error")
                            .and_then(|e| e.as_str())
                            .map(|s| s.to_string())
                    })
                    .unwrap_or_else(|| format!("Erreur HTTP {}", status));
                Err((status, msg))
            }
        }
        Err(e) => Err((0, e.to_string())),
    }
}

/// Traduit une erreur HTTP en message UI (401 = session expirée).
fn forward_err(tx: &Sender<Msg>, err: (u16, String)) {
    let _ = match err {
        (401, _) => tx.send(Msg::Unauthorized),
        (_, m) => tx.send(Msg::Error(m)),
    };
}

/// Désérialise un corps JSON, sinon erreur serveur affichable.
fn parse_ok<R: serde::de::DeserializeOwned>(
    tx: &Sender<Msg>,
    text: String,
    f: impl FnOnce(R),
) {
    match serde_json::from_str::<R>(&text) {
        Ok(v) => f(v),
        Err(_) => {
            let _ = tx.send(Msg::Error("Réponse du serveur invalide.".into()));
        }
    }
}

fn fetch_products(tx: Sender<Msg>, token: Option<String>) {
    thread::spawn(move || {
        #[derive(Deserialize)]
        struct R {
            #[serde(default)]
            products: Vec<Product>,
        }
        match http_call(reqwest::Method::GET, format!("{}/products", API_BASE), token, None, None) {
            Ok(t) => parse_ok(&tx, t, |v: R| {
                let _ = tx.send(Msg::Products(v.products));
            }),
            Err(e) => forward_err(&tx, e),
        }
    });
}

/// supplier → GET /orders (toutes) ; client → GET /orders/mine (les siennes).
fn fetch_orders(tx: Sender<Msg>, token: String, supplier: bool) {
    thread::spawn(move || {
        #[derive(Deserialize)]
        struct R {
            #[serde(default)]
            orders: Vec<Order>,
        }
        let url = if supplier {
            format!("{}/orders", API_BASE)
        } else {
            format!("{}/orders/mine", API_BASE)
        };
        match http_call(reqwest::Method::GET, url, Some(token), None, None) {
            Ok(t) => parse_ok(&tx, t, |v: R| {
                let _ = tx.send(Msg::Orders(v.orders));
            }),
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn fetch_summary(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::GET,
            format!("{}/finances/summary", API_BASE),
            Some(token),
            None,
            None,
        ) {
            Ok(t) => parse_ok(&tx, t, |v: FinanceSummary| {
                let _ = tx.send(Msg::Summary(v));
            }),
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn fetch_expenses(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        #[derive(Deserialize)]
        struct R {
            #[serde(default)]
            expenses: Vec<Expense>,
        }
        match http_call(
            reqwest::Method::GET,
            format!("{}/finances/expenses", API_BASE),
            Some(token),
            None,
            None,
        ) {
            Ok(t) => parse_ok(&tx, t, |v: R| {
                let _ = tx.send(Msg::Expenses(v.expenses));
            }),
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn fetch_catégories(tx: Sender<Msg>, token: Option<String>) {
    thread::spawn(move || {
        #[derive(Deserialize)]
        struct R {
            #[serde(default)]
            catégories: Vec<Category>,
        }
        match http_call(
            reqwest::Method::GET,
            format!("{}/catégories", API_BASE),
            token,
            None,
            None,
        ) {
            Ok(t) => parse_ok(&tx, t, |v: R| {
                let _ = tx.send(Msg::Catégories(v.catégories));
            }),
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn fetch_conversations(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        #[derive(Deserialize)]
        struct R {
            #[serde(default)]
            conversations: Vec<Conversation>,
        }
        match http_call(
            reqwest::Method::GET,
            format!("{}/conversations", API_BASE),
            Some(token),
            None,
            None,
        ) {
            Ok(t) => parse_ok(&tx, t, |v: R| {
                let _ = tx.send(Msg::Conversations(v.conversations));
            }),
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn fetch_messages(tx: Sender<Msg>, token: String, conv_id: i64) {
    thread::spawn(move || {
        #[derive(Deserialize)]
        struct R {
            #[serde(default)]
            messages: Vec<ChatMessage>,
        }
        match http_call(
            reqwest::Method::GET,
            format!("{}/conversations/{}/messages", API_BASE, conv_id),
            Some(token),
            None,
            None,
        ) {
            Ok(t) => parse_ok(&tx, t, |v: R| {
                let _ = tx.send(Msg::Messages(conv_id, v.messages));
            }),
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn mark_read(token: String, conv_id: i64) {
    thread::spawn(move || {
        let _ = http_call(
            reqwest::Method::POST,
            format!("{}/conversations/{}/read", API_BASE, conv_id),
            Some(token),
            None,
            None,
        );
    });
}

fn send_message(tx: Sender<Msg>, token: String, conv_id: i64, body: String) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::POST,
            format!("{}/conversations/{}/messages", API_BASE, conv_id),
            Some(token),
            Some(serde_json::json!({ "body": body })),
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::MessageSent);
            }
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn demo_login(tx: Sender<Msg>, name: String) {
    thread::spawn(move || {
        #[derive(Deserialize)]
        struct R {
            token: String,
            user: User,
        }
        match http_call(
            reqwest::Method::POST,
            format!("{}/auth/demo", API_BASE),
            None,
            Some(serde_json::json!({ "name": name })),
            None,
        ) {
            Ok(t) => parse_ok(&tx, t, |v: R| {
                let _ = tx.send(Msg::LoginOk(v.user, v.token));
            }),
            Err(e) => {
                let _ = match e {
                    (_, m) => tx.send(Msg::LoginErr(m)),
                };
            }
        }
    });
}

/// POST /admin/enter → renvoie **l'objet user directement** (pas { user }).
fn enter_supplier(tx: Sender<Msg>, token: String, code: String) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::POST,
            format!("{}/admin/enter", API_BASE),
            Some(token),
            Some(serde_json::json!({ "code": code })),
            None,
        ) {
            Ok(t) => parse_ok(&tx, t, |u: User| {
                let _ = tx.send(Msg::RoleUpdated(u));
            }),
            Err(e) => forward_err(&tx, e),
        }
    });
}

/// POST /admin/logout-role → renvoie aussi l'objet user directement.
fn leave_supplier(tx: Sender<Msg>, token: String) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::POST,
            format!("{}/admin/logout-role", API_BASE),
            Some(token),
            None,
            None,
        ) {
            Ok(t) => parse_ok(&tx, t, |u: User| {
                let _ = tx.send(Msg::RoleUpdated(u));
            }),
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn create_category(tx: Sender<Msg>, token: String, name: String) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::POST,
            format!("{}/catégories", API_BASE),
            Some(token.clone()),
            Some(serde_json::json!({ "name": name })),
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::Notice("Catégorie ajoutée".into()));
                fetch_catégories(tx.clone(), Some(token));
            }
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn rename_category(tx: Sender<Msg>, token: String, id: i64, name: String) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::PATCH,
            format!("{}/catégories/{}", API_BASE, id),
            Some(token.clone()),
            Some(serde_json::json!({ "name": name })),
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::Notice("Catégorie renommée".into()));
                fetch_catégories(tx.clone(), Some(token));
            }
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn delete_category(tx: Sender<Msg>, token: String, id: i64) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::DELETE,
            format!("{}/catégories/{}", API_BASE, id),
            Some(token.clone()),
            None,
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::Notice("Catégorie supprimée".into()));
                fetch_catégories(tx.clone(), Some(token));
            }
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn create_expense(
    tx: Sender<Msg>,
    token: String,
    label: String,
    amount_cents: i64,
    date: Option<String>,
) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::POST,
            format!("{}/finances/expenses", API_BASE),
            Some(token.clone()),
            Some(serde_json::json!({ "label": label, "amountCents": amount_cents, "date": date })),
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::Notice("Dépense ajoutée".into()));
                fetch_expenses(tx.clone(), token);
            }
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn delete_expense(tx: Sender<Msg>, token: String, id: i64) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::DELETE,
            format!("{}/finances/expenses/{}", API_BASE, id),
            Some(token.clone()),
            None,
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::Notice("Dépense supprimée".into()));
                fetch_expenses(tx.clone(), token);
            }
            Err(e) => forward_err(&tx, e),
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
        let body = serde_json::json!({
            "name": name,
            "description": desc,
            "priceCents": price_cents,
            "costCents": cost_cents,
            "category": category,
            "imageUrl": image_url,
            "available": available,
        });
        match http_call(
            reqwest::Method::POST,
            format!("{}/products", API_BASE),
            Some(token.clone()),
            Some(body),
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::Notice("Produit ajouté".into()));
                fetch_products(tx.clone(), Some(token));
            }
            Err(e) => forward_err(&tx, e),
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
        let body = serde_json::json!({
            "name": name,
            "description": desc,
            "priceCents": price_cents,
            "costCents": cost_cents,
            "category": category,
            "imageUrl": image_url,
            "available": available,
        });
        match http_call(
            reqwest::Method::PATCH,
            format!("{}/products/{}", API_BASE, id),
            Some(token.clone()),
            Some(body),
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::Notice("Produit modifié".into()));
                fetch_products(tx.clone(), Some(token));
            }
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn delete_product(tx: Sender<Msg>, token: String, id: i64) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::DELETE,
            format!("{}/products/{}", API_BASE, id),
            Some(token.clone()),
            None,
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::Notice("Produit supprimé".into()));
                fetch_products(tx.clone(), Some(token));
            }
            Err(e) => forward_err(&tx, e),
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
        let form = match reqwest::blocking::multipart::Form::new().file("image", &path) {
            Ok(f) => f,
            Err(e) => {
                let _ = tx.send(Msg::Error(format!("Lecture impossible : {}", e)));
                return;
            }
        };
        #[derive(Deserialize)]
        struct R {
            url: String,
        }
        match http_call(
            reqwest::Method::POST,
            format!("{}/uploads/product-image", API_BASE),
            Some(token),
            None,
            Some(form),
        ) {
            Ok(t) => parse_ok(&tx, t, |v: R| {
                let _ = tx.send(Msg::ImageUploaded(v.url));
            }),
            Err(e) => forward_err(&tx, e),
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
        let body = serde_json::json!({
            "items": items,
            "address": address,
            "phone": phone,
            "note": note,
        });
        match http_call(
            reqwest::Method::POST,
            format!("{}/orders", API_BASE),
            Some(token),
            Some(body),
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::OrderPlaced);
            }
            Err(e) => forward_err(&tx, e),
        }
    });
}

fn update_order_status(tx: Sender<Msg>, token: String, id: i64, status: String) {
    thread::spawn(move || {
        match http_call(
            reqwest::Method::PATCH,
            format!("{}/orders/{}", API_BASE, id),
            Some(token.clone()),
            Some(serde_json::json!({ "status": status })),
            None,
        ) {
            Ok(_) => {
                let _ = tx.send(Msg::Notice("Statut mis à jour".into()));
                fetch_orders(tx.clone(), token, true);
            }
            Err(e) => forward_err(&tx, e),
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

/* ------------------------------------------------------------- icônes dessinées */

#[derive(Clone, Copy, PartialEq, Eq)]
enum Icon {
    Store,
    Cart,
    Receipt,
    Person,
    Wallet,
    Chat,
    Box,
    Plus,
    Minus,
    Trash,
    Edit,
    ChevronDown,
    Search,
    Check,
    Close,
    Bag,
    Back,
    Logout,
}

/// Dessine une icône 24×24 (style Material) dans `r`. Aucun emoji, aucun glyphe risqué.
fn draw_icon(p: &egui::Painter, icon: Icon, r: egui::Rect, c: egui::Color32, w: f32) {
    let (x0, y0) = (r.left(), r.top());
    let (sw, sh) = (r.width(), r.height());
    let p_at = |fx: f32, fy: f32| egui::pos2(x0 + fx * sw, y0 + fy * sh);
    let stroke = egui::Stroke::new(w, c);

    let poly = |pts: &[(f32, f32)]| {
        for i in 0..pts.len().saturating_sub(1) {
            p.line_segment([p_at(pts[i].0, pts[i].1), p_at(pts[i + 1].0, pts[i + 1].1)], stroke);
        }
    };
    let rect_o = |fx: f32, fy: f32, fw: f32, fh: f32, rad: u8| {
        p.rect_stroke(
            egui::Rect::from_min_size(p_at(fx, fy), egui::vec2(fw * sw, fh * sh)),
            egui::CornerRadius::same(rad),
            stroke,
            egui::StrokeKind::Inside,
        );
    };
    let rect_f = |fx: f32, fy: f32, fw: f32, fh: f32, rad: u8| {
        p.rect_filled(
            egui::Rect::from_min_size(p_at(fx, fy), egui::vec2(fw * sw, fh * sh)),
            egui::CornerRadius::same(rad),
            c,
        );
    };

    match icon {
        Icon::Store => {
            rect_f(0.04, 0.12, 0.92, 0.2, 3); // auvent
            rect_o(0.14, 0.34, 0.72, 0.58, 3); // corps
            rect_f(0.42, 0.6, 0.16, 0.32, 2); // porte
        }
        Icon::Cart => {
            poly(&[(0.04, 0.1), (0.2, 0.1), (0.32, 0.56)]);
            poly(&[(0.32, 0.56), (1.0, 0.56), (0.88, 0.9), (0.4, 0.9), (0.32, 0.56)]);
            p.circle_filled(p_at(0.47, 0.97), 0.07 * sw.min(sh), c);
            p.circle_filled(p_at(0.82, 0.97), 0.07 * sw.min(sh), c);
        }
        Icon::Receipt => {
            rect_o(0.16, 0.08, 0.68, 0.84, 4);
            poly(&[(0.3, 0.32), (0.7, 0.32)]);
            poly(&[(0.3, 0.5), (0.7, 0.5)]);
            poly(&[(0.3, 0.68), (0.58, 0.68)]);
        }
        Icon::Person => {
            p.circle_filled(p_at(0.5, 0.3), 0.2 * sw, c);
            poly(&[(0.14, 0.95), (0.14, 0.7), (0.5, 0.55), (0.86, 0.7), (0.86, 0.95)]);
        }
        Icon::Wallet => {
            rect_o(0.06, 0.2, 0.88, 0.66, 4);
            rect_f(0.62, 0.44, 0.34, 0.18, 2);
        }
        Icon::Chat => {
            rect_o(0.06, 0.12, 0.88, 0.6, 5);
            poly(&[(0.26, 0.72), (0.26, 0.94), (0.5, 0.72)]);
        }
        Icon::Box => {
            rect_o(0.1, 0.3, 0.8, 0.6, 3);
            poly(&[(0.1, 0.48), (0.9, 0.48)]);
            poly(&[(0.38, 0.3), (0.44, 0.14), (0.56, 0.14), (0.62, 0.3)]);
        }
        Icon::Plus => {
            poly(&[(0.5, 0.16), (0.5, 0.84)]);
            poly(&[(0.16, 0.5), (0.84, 0.5)]);
        }
        Icon::Minus => poly(&[(0.16, 0.5), (0.84, 0.5)]),
        Icon::Trash => {
            poly(&[(0.12, 0.22), (0.88, 0.22)]);
            poly(&[(0.38, 0.22), (0.38, 0.1), (0.62, 0.1), (0.62, 0.22)]);
            poly(&[(0.22, 0.3), (0.31, 0.92), (0.69, 0.92), (0.78, 0.3), (0.22, 0.3)]);
            poly(&[(0.43, 0.42), (0.45, 0.78)]);
            poly(&[(0.57, 0.42), (0.55, 0.78)]);
        }
        Icon::Edit => {
            poly(&[
                (0.1, 0.9),
                (0.14, 0.7),
                (0.78, 0.1),
                (0.9, 0.22),
                (0.3, 0.84),
                (0.1, 0.9),
            ]);
            poly(&[(0.68, 0.2), (0.8, 0.32)]);
        }
        Icon::ChevronDown => poly(&[(0.2, 0.38), (0.5, 0.66), (0.8, 0.38)]),
        Icon::Search => {
            p.circle_stroke(p_at(0.44, 0.44), 0.3 * sw.min(sh), stroke);
            poly(&[(0.66, 0.66), (0.92, 0.92)]);
        }
        Icon::Check => poly(&[(0.16, 0.52), (0.42, 0.78), (0.86, 0.22)]),
        Icon::Close => {
            poly(&[(0.2, 0.2), (0.8, 0.8)]);
            poly(&[(0.8, 0.2), (0.2, 0.8)]);
        }
        Icon::Bag => {
            rect_f(0.14, 0.3, 0.72, 0.66, 5);
            poly(&[(0.32, 0.3), (0.36, 0.13), (0.64, 0.13), (0.68, 0.3)]);
        }
        Icon::Back => {
            poly(&[(0.86, 0.5), (0.14, 0.5)]);
            poly(&[(0.42, 0.22), (0.14, 0.5), (0.42, 0.78)]);
        }
        Icon::Logout => {
            rect_o(0.06, 0.14, 0.5, 0.72, 3);
            poly(&[(0.36, 0.5), (0.92, 0.5)]);
            poly(&[(0.68, 0.28), (0.92, 0.5), (0.68, 0.72)]);
        }
    }
}

/// Alloue un carré et y dessine l'icône.
fn icon(ui: &mut egui::Ui, ic: Icon, size: f32, color: egui::Color32) -> egui::Response {
    let (rect, resp) = ui.allocate_exact_size(egui::vec2(size, size), egui::Sense::hover());
    draw_icon(ui.painter(), ic, rect, color, 2.0);
    resp
}

/// Bouton icône rond (fond translucide, survol plus clair).
fn icon_btn(ui: &mut egui::Ui, ic: Icon, base: egui::Color32, fg: egui::Color32, size: f32) -> bool {
    let (rect, resp) = ui.allocate_exact_size(egui::vec2(size, size), egui::Sense::click());
    let mut fill = base;
    if resp.hovered() {
        fill = egui::Color32::from_rgba_unmultiplied(
            base.r(),
            base.g(),
            base.b(),
            base.a().saturating_add(45),
        );
    }
    let p = ui.painter();
    p.rect_filled(rect, egui::CornerRadius::same((size / 2.0) as u8), fill);
    let inner = egui::Rect::from_center_size(rect.center(), egui::vec2(size * 0.56, size * 0.56));
    draw_icon(p, ic, inner, fg, 2.0);
    resp.clicked()
}

/* --------------------------------------------------------- helpers UI */

fn card(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui)) {
    egui::Frame::new()
        .fill(SURFACE)
        .stroke(egui::Stroke::new(1.0_f32, glass(12)))
        .corner_radius(egui::CornerRadius::same(20))
        .inner_margin(egui::Margin::same(14))
        .show(ui, |ui| add(ui));
}

fn section_title(ui: &mut egui::Ui, text: &str) {
    ui.add_space(6.0);
    ui.label(egui::RichText::new(text).size(16.0).strong().color(TEXT));
    ui.add_space(6.0);
}

fn btn_primary(ui: &mut egui::Ui, label: &str) -> egui::Response {
    ui.add(
        egui::Button::new(egui::RichText::new(label).color(egui::Color32::WHITE).strong())
            .fill(ORANGE)
            .corner_radius(egui::CornerRadius::same(14))
            .min_size(egui::vec2(0.0, 38.0)),
    )
}

fn btn_ghost(ui: &mut egui::Ui, label: &str) -> egui::Response {
    ui.add(
        egui::Button::new(egui::RichText::new(label).color(TEXT))
            .fill(GREY)
            .corner_radius(egui::CornerRadius::same(14))
            .min_size(egui::vec2(0.0, 34.0)),
    )
}

fn btn_danger(ui: &mut egui::Ui, label: &str) -> egui::Response {
    ui.add(
        egui::Button::new(egui::RichText::new(label).color(RED))
            .fill(alpha(RED, 34))
            .corner_radius(egui::CornerRadius::same(14))
            .min_size(egui::vec2(0.0, 36.0)),
    )
}

/// Chip sélectionnable (style FilterChip Android).
fn chip(ui: &mut egui::Ui, label: &str, selected: bool) -> egui::Response {
    let (fill, fg) = if selected {
        (alpha(ORANGE, 36), ORANGE)
    } else {
        (GREY, MUTED)
    };
    ui.add(
        egui::Button::new(egui::RichText::new(label).color(fg).strong())
            .fill(fill)
            .corner_radius(egui::CornerRadius::same(200))
            .min_size(egui::vec2(0.0, 30.0)),
    )
}

/// Pilule de statut (fond alpha de la couleur du statut).
fn status_pill(ui: &mut egui::Ui, status: &str) {
    let c = status_color(status);
    egui::Frame::new()
        .fill(alpha(c, 36))
        .corner_radius(egui::CornerRadius::same(200))
        .inner_margin(egui::Margin {
            left: 10,
            right: 10,
            top: 3,
            bottom: 3,
        })
        .show(ui, |ui| {
            ui.label(egui::RichText::new(status_fr(status)).color(c).strong().size(12.0));
        });
}

fn empty_state(ui: &mut egui::Ui, ic: Icon, title: &str, msg: &str) {
    ui.vertical_centered(|ui| {
        ui.add_space(48.0);
        let (rect, _) = ui.allocate_exact_size(egui::vec2(56.0, 56.0), egui::Sense::hover());
        draw_icon(ui.painter(), ic, rect, alpha(MUTED, 140), 2.5);
        ui.add_space(12.0);
        ui.label(egui::RichText::new(title).size(17.0).strong().color(TEXT));
        ui.label(egui::RichText::new(msg).size(13.0).color(MUTED));
        ui.add_space(48.0);
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
        "pending" => AMBER,
        "accepted" | "preparing" => BLUE,
        "delivering" => PURPLE,
        "delivered" => GREEN,
        "refused" => RED,
        _ => MUTED,
    }
}

/// Transitions strictes du backend.
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
        "accepted" => "Accepter",
        "refused" => "Refuser",
        "preparing" => "Passer en préparation",
        "delivering" => "Passer en livraison",
        "delivered" => "Marquer livrée",
        _ => "",
    }
}

fn short_time(iso: &Option<String>) -> String {
    match iso {
        Some(t) if t.len() >= 16 => t[11..16].to_string(),
        Some(t) => t.clone(),
        None => String::new(),
    }
}

fn status_role(r: &str) -> &'static str {
    match r {
        "supplier" => "Fournisseur",
        _ => "Client",
    }
}

/* ----------------------------------------------------------- application */

impl ShopApp {
    fn set_notice(&mut self, msg: impl Into<String>) {
        self.notice = Some(msg.into());
        self.notice_at = Some(Instant::now());
    }

    fn is_supplier(&self) -> bool {
        self.user.as_ref().map(|u| u.is_supplier()).unwrap_or(false)
    }

    fn can_chat(&self) -> bool {
        true
    }

    fn cart_qty(&self) -> i64 {
        self.cart.iter().map(|l| l.qty).sum()
    }

    fn reload_orders(&self) {
        if let Some(t) = self.token.clone() {
            fetch_orders(self.tx.clone(), t, self.is_supplier());
        }
    }

    fn logout(&mut self) {
        self.user = None;
        self.token = None;
        self.conversations.clear();
        self.chat_id = None;
        self.chat_messages.clear();
        self.orders.clear();
        self.products.clear();
        self.catégories.clear();
        self.expenses.clear();
        self.summary = None;
        self.cart.clear();
        self.admin_tab = 0;
        self.expanded_order = None;
        self.name_input.clear();
        self.screen = Screen::Login;
        self.set_notice("Déconnecté");
    }

    /// Chargement automatique quand on change d'écran.
    fn on_screen_change(&mut self) {
        match self.screen {
            Screen::Boutique => {
                fetch_products(self.tx.clone(), self.token.clone());
                fetch_catégories(self.tx.clone(), self.token.clone());
            }
            Screen::Orders => self.reload_orders(),
            Screen::Chat => {
                if let Some(t) = self.token.clone() {
                    fetch_conversations(self.tx.clone(), t);
                }
            }
            Screen::Admin => {
                fetch_products(self.tx.clone(), self.token.clone());
                fetch_catégories(self.tx.clone(), self.token.clone());
            }
            Screen::Finances => {
                if let Some(t) = self.token.clone() {
                    fetch_summary(self.tx.clone(), t.clone());
                    fetch_expenses(self.tx.clone(), t);
                }
            }
            _ => {}
        }
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

    /// Vignette produit (cache d'images téléchargées en arrière-plan).
    fn product_thumb(&mut self, ui: &mut egui::Ui, url: Option<&str>, size: f32) {
        let (rect, _) = ui.allocate_exact_size(egui::vec2(size, size), egui::Sense::hover());
        let p = ui.painter();
        p.rect_filled(rect, egui::CornerRadius::same(14), GREY);

        let url = url.filter(|u| !u.is_empty());
        match url {
            Some(u) => {
                if !self.images.contains_key(u) && !self.img_pending.contains(u) {
                    self.img_pending.insert(u.to_string());
                    let tx = self.tx.clone();
                    fetch_image(u.to_string(), tx);
                }
                if let Some(t) = self.images.get(u) {
                    let uv =
                        egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0));
                    p.image(t.id(), rect, uv, egui::Color32::WHITE);
                } else {
                    let inner =
                        egui::Rect::from_center_size(rect.center(), egui::vec2(size * 0.5, size * 0.5));
                    draw_icon(p, Icon::Box, inner, alpha(MUTED, 150), 2.0);
                }
            }
            None => {
                let inner =
                    egui::Rect::from_center_size(rect.center(), egui::vec2(size * 0.5, size * 0.5));
                draw_icon(p, Icon::Bag, inner, alpha(MUTED, 150), 2.0);
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
        self.set_notice("Ajouté au panier");
    }

    /* ------------------------------------------------------------ écrans */

    fn ui_login(&mut self, ui: &mut egui::Ui) {
        ui.vertical_centered(|ui| {
            ui.set_max_width(420.0);
            ui.add_space(48.0);

            // Logo dessiné
            let (rect, _) = ui.allocate_exact_size(egui::vec2(72.0, 72.0), egui::Sense::hover());
            let p = ui.painter();
            p.rect_filled(
                egui::Rect::from_center_size(rect.center(), egui::vec2(72.0, 72.0)),
                egui::CornerRadius::same(24),
                alpha(ORANGE, 30),
            );
            let inner =
                egui::Rect::from_center_size(rect.center(), egui::vec2(40.0, 40.0));
            draw_icon(p, Icon::Bag, inner, ORANGE, 2.5);

            ui.add_space(12.0);
            ui.label(
                egui::RichText::new("ShopTaBouffe")
                    .size(30.0)
                    .strong()
                    .color(ORANGE),
            );
            ui.label(
                egui::RichText::new("Vos commerçants locaux, en un clic")
                    .size(14.0)
                    .color(MUTED),
            );
            ui.add_space(28.0);

            card(ui, |ui| {
                ui.label(egui::RichText::new("Votre nom").strong().color(TEXT));
                ui.add_space(4.0);
                ui.add(
                    egui::TextEdit::singleline(&mut self.name_input)
                        .desired_width(f32::INFINITY)
                        .hint_text("Ex. : Karim")
                        .margin(egui::Margin::same(10)),
                );
                ui.add_space(12.0);
                let busy = self.busy;
                let empty = self.name_input.trim().is_empty();
                ui.add_enabled_ui(!busy && !empty, |ui| {
                    let label = if busy {
                        "Connexion..."
                    } else {
                        "Se connecter avec ce nom"
                    };
                    if btn_primary(ui, label).clicked() {
                        self.busy = true;
                        let name = self.name_input.trim().to_string();
                        demo_login(self.tx.clone(), name);
                    }
                });
            });

            ui.add_space(18.0);
            ui.label(egui::RichText::new("ou continuer avec").color(MUTED));
            ui.add_space(10.0);

            ui.horizontal(|ui| {
                let google = egui::Button::new(
                    egui::RichText::new("Continuer avec Google")
                        .color(egui::Color32::from_rgb(32, 33, 36))
                        .strong(),
                )
                .fill(egui::Color32::WHITE)
                .stroke(egui::Stroke::new(
                    1.0_f32,
                    egui::Color32::from_rgb(200, 200, 200),
                ))
                .corner_radius(egui::CornerRadius::same(14))
                .min_size(egui::vec2(0.0, 38.0));
                if ui.add(google).clicked() {
                    let _ = open::that(
                        "https://chorizo.dpdns.org/api/auth/start?provider=google&target=web",
                    );
                }
                let github = egui::Button::new(
                    egui::RichText::new("Continuer avec GitHub")
                        .color(egui::Color32::from_rgb(36, 41, 47))
                        .strong(),
                )
                .fill(egui::Color32::from_rgb(246, 248, 250))
                .stroke(egui::Stroke::new(
                    1.0_f32,
                    egui::Color32::from_rgb(208, 215, 222),
                ))
                .corner_radius(egui::CornerRadius::same(14))
                .min_size(egui::vec2(0.0, 38.0));
                if ui.add(github).clicked() {
                    let _ = open::that(
                        "https://chorizo.dpdns.org/api/auth/start?provider=github&target=web",
                    );
                }
            });

            ui.add_space(14.0);
            ui.label(
                egui::RichText::new("Après connexion via le navigateur, revenez ici.")
                    .size(11.0)
                    .color(MUTED),
            );
            ui.add_space(40.0);
        });
    }

    fn ui_boutique(&mut self, ui: &mut egui::Ui) {
        let supplier = self.is_supplier();

        // Recherche + rafraichissement
        ui.horizontal(|ui| {
            let (rect, _) = ui.allocate_exact_size(egui::vec2(20.0, 20.0), egui::Sense::hover());
            draw_icon(ui.painter(), Icon::Search, rect, MUTED, 2.0);
            ui.add(
                egui::TextEdit::singleline(&mut self.search)
                    .desired_width(f32::INFINITY)
                    .hint_text("Rechercher un produit..."),
            );
            if btn_ghost(ui, "Actualiser").clicked() {
                fetch_products(self.tx.clone(), self.token.clone());
            }
        });

        // Chips catégories
        let cats: Vec<String> = {
            let mut s: std::collections::BTreeSet<String> =
                self.products.iter().map(|p| p.category.clone()).collect();
            s.remove("");
            s.into_iter().collect()
        };
        ui.add_space(8.0);
        ui.horizontal_wrapped(|ui| {
            if chip(ui, "Tout", self.category.is_none()).clicked() {
                self.category = None;
            }
            for c in &cats {
                let sel = self.category.as_deref() == Some(c.as_str());
                if chip(ui, c, sel).clicked() {
                    self.category = Some(c.clone());
                }
            }
        });
        ui.add_space(8.0);

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

        egui::ScrollArea::vertical()
            .id_salt("boutique")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                if items.is_empty() {
                    empty_state(
                        ui,
                        Icon::Store,
                        "Aucun produit",
                        "Aucun produit ne correspond à votre recherche.",
                    );
                }
                for p in &items {
                    let p = p.clone();
                    card(ui, |ui| {
                        ui.horizontal(|ui| {
                            self.product_thumb(ui, p.image_url.as_deref(), 64.0);
                            ui.add_space(10.0);
                            ui.vertical(|ui| {
                                ui.label(egui::RichText::new(&p.name).strong().size(15.0).color(TEXT));
                                ui.label(
                                    egui::RichText::new(format!(
                                        "{}  ·  {}",
                                        p.category,
                                        cents(p.price_cents)
                                    ))
                                    .color(MUTED)
                                    .size(12.0),
                                );
                                if let Some(d) = &p.description {
                                    if !d.is_empty() {
                                        ui.label(
                                            egui::RichText::new(d)
                                                .size(11.0)
                                                .color(alpha(MUTED, 220)),
                                        );
                                    }
                                }
                                if !p.available {
                                    egui::Frame::new()
                                        .fill(alpha(RED, 36))
                                        .corner_radius(egui::CornerRadius::same(200))
                                        .inner_margin(egui::Margin {
                                            left: 8,
                                            right: 8,
                                            top: 2,
                                            bottom: 2,
                                        })
                                        .show(ui, |ui| {
                                            ui.label(
                                                egui::RichText::new("Indisponible")
                                                    .color(RED)
                                                    .size(11.0)
                                                    .strong(),
                                            );
                                        });
                                }
                            });
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    if p.available && !supplier {
                                        ui.add_enabled_ui(true, |ui| {
                                            if btn_primary(ui, "Ajouter").clicked() {
                                                self.add_to_cart(&p);
                                            }
                                        });
                                    }
                                },
                            );
                        });
                    });
                    ui.add_space(8.0);
                }
                ui.add_space(12.0);
            });
    }

    fn ui_cart(&mut self, ui: &mut egui::Ui) {
        if self.cart.is_empty() {
            empty_state(
                ui,
                Icon::Cart,
                "Panier vide",
                "Ajoutez des produits depuis la boutique.",
            );
            return;
        }

        let mut total: i64 = 0;
        let mut remove: Option<usize> = None;
        let mut bump: Option<usize> = None;
        let mut drop: Option<usize> = None;

        egui::ScrollArea::vertical()
            .id_salt("cart")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                for (i, line) in self.cart.iter_mut().enumerate() {
                    card(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.vertical(|ui| {
                                ui.label(
                                    egui::RichText::new(&line.product.name)
                                        .strong()
                                        .size(15.0)
                                        .color(TEXT),
                                );
                                ui.label(
                                    egui::RichText::new(cents(line.product.price_cents))
                                        .color(MUTED)
                                        .size(12.0),
                                );
                            });
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    ui.label(
                                        egui::RichText::new(cents(
                                            line.product.price_cents * line.qty,
                                        ))
                                        .strong()
                                        .size(14.0)
                                        .color(TEXT),
                                    );
                                    ui.add_space(8.0);
                                    if icon_btn(
                                        ui,
                                        Icon::Trash,
                                        alpha(RED, 34),
                                        RED,
                                        30.0,
                                    ) {
                                        remove = Some(i);
                                    }
                                    ui.add_space(6.0);
                                    if icon_btn(ui, Icon::Plus, alpha(ORANGE, 34), ORANGE, 30.0) {
                                        bump = Some(i);
                                    }
                                    ui.add_space(6.0);
                                    ui.label(
                                        egui::RichText::new(format!("{}", line.qty))
                                            .strong()
                                            .color(TEXT),
                                    );
                                    ui.add_space(6.0);
                                    if icon_btn(ui, Icon::Minus, GREY, TEXT, 30.0)
                                        && line.qty > 1
                                    {
                                        drop = Some(i);
                                    }
                                },
                            );
                        });
                    });
                    ui.add_space(8.0);
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
        if let Some(i) = drop {
            if let Some(l) = self.cart.get_mut(i) {
                l.qty -= 1;
            }
        }

        card(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new("Total").strong().size(15.0).color(TEXT));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(
                        egui::RichText::new(cents(total))
                            .size(20.0)
                            .strong()
                            .color(ORANGE),
                    );
                });
            });
        });

        ui.add_space(10.0);
        section_title(ui, "Livraison");
        card(ui, |ui| {
            ui.label(egui::RichText::new("Adresse").color(MUTED).size(12.0));
            ui.add(
                egui::TextEdit::singleline(&mut self.order_address)
                    .desired_width(f32::INFINITY)
                    .hint_text("3 à 200 caractères")
                    .margin(egui::Margin::same(10)),
            );
            ui.add_space(8.0);
            ui.label(egui::RichText::new("Téléphone").color(MUTED).size(12.0));
            ui.add(
                egui::TextEdit::singleline(&mut self.order_phone)
                    .desired_width(f32::INFINITY)
                    .hint_text("6 à 30 caractères")
                    .margin(egui::Margin::same(10)),
            );
            ui.add_space(8.0);
            ui.label(egui::RichText::new("Note (facultatif)").color(MUTED).size(12.0));
            ui.add(
                egui::TextEdit::multiline(&mut self.order_note)
                    .desired_rows(2)
                    .desired_width(f32::INFINITY)
                    .margin(egui::Margin::same(10)),
            );
        });

        ui.add_space(10.0);
        let label = format!("Passer la commande  ·  {}", cents(total));
        if btn_primary(ui, &label).clicked() {
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
        ui.add_space(16.0);
    }
}

impl ShopApp {
    fn order_card(&mut self, ui: &mut egui::Ui, o: &Order) {
        let expanded = self.expanded_order == Some(o.id);
        let supplier = self.is_supplier();
        let token = self.token.clone();
        let tx = self.tx.clone();

        card(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new(format!("#{}", o.id))
                        .strong()
                        .size(15.0)
                        .color(TEXT),
                );
                status_pill(ui, &o.status);
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(
                        egui::RichText::new(cents(o.total_cents))
                            .strong()
                            .size(15.0)
                            .color(ORANGE),
                    );
                    ui.add_space(8.0);
                    if icon_btn(
                        ui,
                        Icon::ChevronDown,
                        GREY,
                        MUTED,
                        28.0,
                    ) {
                        self.expanded_order = if expanded { None } else { Some(o.id) };
                    }
                });
            });

            if let Some(c) = &o.customer {
                if let Some(n) = &c.name {
                    ui.label(egui::RichText::new(n).color(MUTED).size(12.0));
                }
            }
            ui.label(
                egui::RichText::new(
                    o.items
                        .iter()
                        .map(|i| format!("{}x {}", i.qty, i.name))
                        .collect::<Vec<_>>()
                        .join(", "),
                )
                .size(12.0)
                .color(alpha(MUTED, 230)),
            );

            if expanded {
                ui.add_space(8.0);
                egui::Frame::new()
                    .fill(GREY)
                    .corner_radius(egui::CornerRadius::same(14))
                    .inner_margin(egui::Margin::same(12))
                    .show(ui, |ui| {
                        if let Some(a) = &o.address {
                            if !a.is_empty() {
                                ui.label(
                                    egui::RichText::new(format!("Adresse : {}", a))
                                        .size(12.0)
                                        .color(TEXT),
                                );
                            }
                        }
                        if let Some(p) = &o.phone {
                            if !p.is_empty() {
                                ui.label(
                                    egui::RichText::new(format!("Téléphone : {}", p))
                                        .size(12.0)
                                        .color(TEXT),
                                );
                            }
                        }
                        if let Some(n) = &o.note {
                            if !n.is_empty() {
                                ui.label(
                                    egui::RichText::new(format!("Note : {}", n))
                                        .size(12.0)
                                        .color(MUTED),
                                );
                            }
                        }
                        if let Some(t) = &o.created_at {
                            ui.label(
                                egui::RichText::new(format!("Créée le {}", t))
                                    .size(11.0)
                                    .color(MUTED),
                            );
                        }
                        ui.add_space(6.0);
                        for it in &o.items {
                            ui.label(
                                egui::RichText::new(format!(
                                    "{} x {} = {}",
                                    it.name,
                                    it.qty,
                                    cents(it.price_cents * it.qty)
                                ))
                                .size(12.0)
                                .color(MUTED),
                            );
                        }
                    });

                let next = next_statuses(&o.status);
                if supplier && !next.is_empty() {
                    ui.add_space(10.0);
                    ui.horizontal_wrapped(|ui| {
                        for st in next {
                            let label = status_action(st);
                            if *st == "refused" {
                                if btn_danger(ui, label).clicked() {
                                    if let Some(t) = token.clone() {
                                        update_order_status(tx.clone(), t, o.id, (*st).to_string());
                                    }
                                }
                            } else if btn_ghost(ui, label).clicked() {
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
            if btn_ghost(ui, "Rafraîchir").clicked() {
                self.reload_orders();
            }
            let label = if self.is_supplier() {
                format!("{} commande(s) au total", self.orders.len())
            } else {
                format!("{} commande(s)", self.orders.len())
            };
            ui.label(egui::RichText::new(label).color(MUTED).size(12.0));
        });
        ui.add_space(8.0);

        if self.orders.is_empty() {
            empty_state(
                ui,
                Icon::Receipt,
                "Aucune commande",
                "Les nouvelles commandes apparaîtront ici automatiquement.",
            );
            return;
        }
        let orders = self.orders.clone();
        egui::ScrollArea::vertical()
            .id_salt("orders")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                for o in &orders {
                    self.order_card(ui, o);
                    ui.add_space(8.0);
                }
            });
    }

    fn ui_profile(&mut self, ui: &mut egui::Ui) {
        let Some(u) = self.user.clone() else {
            empty_state(ui, Icon::Person, "Non connecté", "");
            return;
        };

        egui::ScrollArea::vertical()
            .id_salt("profile")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                // Carte identite
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        let (rect, _) =
                            ui.allocate_exact_size(egui::vec2(56.0, 56.0), egui::Sense::hover());
                        let p = ui.painter();
                        p.circle_filled(rect.center(), 28.0, alpha(ORANGE, 40));
                        let initial = u.name.chars().next().unwrap_or('?').to_uppercase().to_string();
                        p.text(
                            rect.center(),
                            egui::Align2::CENTER_CENTER,
                            initial,
                            egui::FontId::proportional(24.0),
                            ORANGE,
                        );
                        ui.add_space(12.0);
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new(&u.name).size(20.0).strong().color(TEXT));
                            ui.horizontal(|ui| {
                                let role = status_role(&u.role);
                                let c = if u.is_supplier() { ORANGE } else { BLUE };
                                egui::Frame::new()
                                    .fill(alpha(c, 36))
                                    .corner_radius(egui::CornerRadius::same(200))
                                    .inner_margin(egui::Margin {
                                        left: 10,
                                        right: 10,
                                        top: 3,
                                        bottom: 3,
                                    })
                                    .show(ui, |ui| {
                                        ui.label(
                                            egui::RichText::new(role).color(c).strong().size(12.0),
                                        );
                                    });
                                if let Some(p) = &u.provider {
                                    ui.label(
                                        egui::RichText::new(format!("Connexion : {}", p))
                                            .color(MUTED)
                                            .size(11.0),
                                    );
                                }
                            });
                        });
                    });
                });

                ui.add_space(12.0);

                // Espace fournisseur
                if u.is_supplier() {
                    card(ui, |ui| {
                        ui.horizontal(|ui| {
                            let (rect, _) =
                                ui.allocate_exact_size(egui::vec2(22.0, 22.0), egui::Sense::hover());
                            draw_icon(ui.painter(), Icon::Check, rect, GREEN, 2.5);
                            ui.label(
                                egui::RichText::new("Espace fournisseur actif")
                                    .strong()
                                    .color(GREEN),
                            );
                        });
                        ui.label(
                            egui::RichText::new(
                                "Vous gérez les commandes, produits, catégories et finances.",
                            )
                            .color(MUTED)
                            .size(12.0),
                        );
                        ui.add_space(10.0);
                        if btn_danger(ui, "Désactiver le mode fournisseur").clicked() {
                            if let Some(t) = self.token.clone() {
                                leave_supplier(self.tx.clone(), t);
                            }
                        }
                    });
                } else {
                    card(ui, |ui| {
                        ui.label(
                            egui::RichText::new("Activer le mode fournisseur")
                                .strong()
                                .color(TEXT),
                        );
                        ui.label(
                            egui::RichText::new("Entrez votre code d'accès")
                                .color(MUTED)
                                .size(12.0),
                        );
                        ui.add_space(6.0);
                        ui.horizontal(|ui| {
                            ui.add(
                                egui::TextEdit::singleline(&mut self.supplier_code)
                                    .desired_width(f32::INFINITY)
                                    .hint_text("CODE-XXXX")
                                    .margin(egui::Margin::same(10)),
                            );
                            let code = self.supplier_code.clone();
                            if btn_primary(ui, "Valider").clicked() && !code.trim().is_empty() {
                                if let Some(t) = self.token.clone() {
                                    enter_supplier(self.tx.clone(), t, code);
                                }
                            }
                        });
                    });
                }

                ui.add_space(12.0);

                // Infos
                card(ui, |ui| {
                    ui.label(egui::RichText::new("Application").strong().color(TEXT));
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new("Version").color(MUTED).size(12.0));
                        ui.with_layout(
                            egui::Layout::right_to_left(egui::Align::Center),
                            |ui| {
                                ui.label(
                                    egui::RichText::new(format!("v{}", APP_VERSION))
                                        .color(TEXT)
                                        .size(12.0),
                                );
                            },
                        );
                    });
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new("Serveur").color(MUTED).size(12.0));
                        ui.with_layout(
                            egui::Layout::right_to_left(egui::Align::Center),
                            |ui| {
                                ui.label(
                                    egui::RichText::new("chorizo.dpdns.org")
                                        .color(TEXT)
                                        .size(12.0),
                                );
                            },
                        );
                    });
                });

                ui.add_space(12.0);
                if btn_danger(ui, "Se déconnecter").clicked() {
                    self.logout();
                }
                ui.add_space(24.0);
            });
    }

    fn ui_admin(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            if chip(ui, "Produits", self.admin_tab == 0).clicked() {
                self.admin_tab = 0;
                fetch_products(self.tx.clone(), self.token.clone());
            }
            if chip(ui, "Catégories", self.admin_tab == 1).clicked() {
                self.admin_tab = 1;
                fetch_catégories(self.tx.clone(), self.token.clone());
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if btn_ghost(ui, "Rafraîchir").clicked() {
                    match self.admin_tab {
                        1 => fetch_catégories(self.tx.clone(), self.token.clone()),
                        _ => fetch_products(self.tx.clone(), self.token.clone()),
                    }
                }
            });
        });
        ui.add_space(8.0);

        match self.admin_tab {
            1 => self.ui_admin_catégories(ui),
            _ => self.ui_admin_products(ui),
        }
    }

    fn ui_admin_products(&mut self, ui: &mut egui::Ui) {
        let editing = self.editing_id;
        let cat_names: Vec<String> = self.catégories.iter().map(|c| c.name.clone()).collect();

        // Formulaire (en haut, toujours visible)
        card(ui, |ui| {
            ui.label(
                egui::RichText::new(if editing.is_some() {
                    "Modifier le produit"
                } else {
                    "Nouveau produit"
                })
                .strong()
                .size(15.0)
                .color(if editing.is_some() { ORANGE } else { TEXT }),
            );
            ui.add_space(8.0);

            ui.label(egui::RichText::new("Nom").color(MUTED).size(12.0));
            ui.add(
                egui::TextEdit::singleline(&mut self.new_prod_name)
                    .desired_width(f32::INFINITY)
                    .margin(egui::Margin::same(10)),
            );

            ui.add_space(6.0);
            ui.horizontal(|ui| {
                ui.vertical(|ui| {
                    ui.label(egui::RichText::new("Prix de vente").color(MUTED).size(12.0));
                    ui.add(
                        egui::TextEdit::singleline(&mut self.new_prod_price)
                            .hint_text("12,50")
                            .margin(egui::Margin::same(10)),
                    );
                });
                ui.add_space(8.0);
                ui.vertical(|ui| {
                    ui.label(egui::RichText::new("Cout").color(MUTED).size(12.0));
                    ui.add(
                        egui::TextEdit::singleline(&mut self.new_prod_cost)
                            .hint_text("6,00")
                            .margin(egui::Margin::same(10)),
                    );
                });
            });

            ui.add_space(6.0);
            ui.label(egui::RichText::new("Catégorie").color(MUTED).size(12.0));
            egui::ComboBox::from_id_salt("prod_cat")
                .selected_text(if self.new_prod_category.is_empty() {
                    "Choisir...".to_string()
                } else {
                    self.new_prod_category.clone()
                })
                .width(240.0)
                .show_ui(ui, |ui| {
                    for c in &cat_names {
                        ui.selectable_value(&mut self.new_prod_category, c.clone(), c);
                    }
                });

            ui.add_space(6.0);
            ui.label(egui::RichText::new("Description").color(MUTED).size(12.0));
            ui.add(
                egui::TextEdit::multiline(&mut self.new_prod_desc)
                    .desired_rows(2)
                    .desired_width(f32::INFINITY)
                    .margin(egui::Margin::same(10)),
            );

            ui.add_space(6.0);
            ui.checkbox(&mut self.new_prod_available, " Disponible");

            // Photo
            ui.add_space(8.0);
            ui.label(egui::RichText::new("Photo").color(MUTED).size(12.0));
            ui.horizontal(|ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut self.image_path)
                        .desired_width(f32::INFINITY)
                        .hint_text("Chemin du fichier image")
                        .margin(egui::Margin::same(10)),
                );
                if btn_ghost(ui, "Parcourir...").clicked() {
                    if let Some(p) = rfd::FileDialog::new()
                        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"])
                        .pick_file()
                    {
                        self.image_path = p.to_string_lossy().into_owned();
                    }
                }
                let path = self.image_path.clone();
                if ui
                    .add_enabled(!path.is_empty(), egui::Button::new(
                        egui::RichText::new("Envoyer").color(egui::Color32::WHITE).strong(),
                    ).fill(ORANGE).corner_radius(egui::CornerRadius::same(14)))
                    .clicked()
                {
                    if let Some(t) = self.token.clone() {
                        upload_image(self.tx.clone(), t, path);
                    }
                }
            });
            if !self.new_prod_image.is_empty() {
                ui.label(
                    egui::RichText::new(format!("Photo envoyée : {}", self.new_prod_image))
                        .size(11.0)
                        .color(GREEN),
                );
            }

            ui.add_space(10.0);
            ui.horizontal(|ui| {
                let ok = !self.new_prod_name.trim().is_empty()
                    && !self.new_prod_category.trim().is_empty();
                let label = if editing.is_some() {
                    "Enregistrer"
                } else {
                    "Ajouter le produit"
                };
                ui.add_enabled_ui(ok, |ui| {
                    if btn_primary(ui, label).clicked() {
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
                                update_product(
                                    self.tx.clone(),
                                    t,
                                    id,
                                    name,
                                    desc,
                                    price,
                                    cost,
                                    cat,
                                    img,
                                    avail,
                                );
                            } else {
                                create_product(
                                    self.tx.clone(),
                                    t,
                                    name,
                                    desc,
                                    price,
                                    cost,
                                    cat,
                                    img,
                                    avail,
                                );
                            }
                        }
                        self.reset_product_form();
                    }
                });
                if editing.is_some() && btn_ghost(ui, "Annuler").clicked() {
                    self.reset_product_form();
                }
            });
        });

        ui.add_space(12.0);
        ui.horizontal(|ui| {
            ui.label(
                egui::RichText::new(format!("{} produit(s)", self.products.len()))
                    .color(MUTED)
                    .size(12.0),
            );
        });
        ui.add_space(6.0);

        let products = self.products.clone();
        egui::ScrollArea::vertical()
            .id_salt("admin_products")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                if products.is_empty() {
                    empty_state(
                        ui,
                        Icon::Box,
                        "Aucun produit",
                        "Ajoutez votre premier produit ci-dessus.",
                    );
                }
                for p in &products {
                    let p = p.clone();
                    card(ui, |ui| {
                        ui.horizontal(|ui| {
                            self.product_thumb(ui, p.image_url.as_deref(), 52.0);
                            ui.add_space(10.0);
                            ui.vertical(|ui| {
                                ui.label(
                                    egui::RichText::new(&p.name).strong().size(14.0).color(TEXT),
                                );
                                ui.label(
                                    egui::RichText::new(format!(
                                        "{}  ·  vente {}  ·  coût {}",
                                        p.category,
                                        cents(p.price_cents),
                                        cents(p.cost_cents)
                                    ))
                                    .color(MUTED)
                                    .size(11.0),
                                );
                                if !p.available {
                                    ui.label(
                                        egui::RichText::new("Indisponible")
                                            .color(RED)
                                            .size(11.0),
                                    );
                                }
                            });
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    if icon_btn(ui, Icon::Trash, alpha(RED, 34), RED, 32.0) {
                                        if let Some(t) = self.token.clone() {
                                            delete_product(self.tx.clone(), t, p.id);
                                        }
                                        if self.editing_id == Some(p.id) {
                                            self.reset_product_form();
                                        }
                                    }
                                    ui.add_space(6.0);
                                    if icon_btn(ui, Icon::Edit, GREY, TEXT, 32.0) {
                                        self.editing_id = Some(p.id);
                                        self.new_prod_name = p.name.clone();
                                        self.new_prod_price =
                                            format!("{:.2}", p.price_cents as f64 / 100.0);
                                        self.new_prod_cost =
                                            format!("{:.2}", p.cost_cents as f64 / 100.0);
                                        self.new_prod_category = p.category.clone();
                                        self.new_prod_desc =
                                            p.description.clone().unwrap_or_default();
                                        self.new_prod_available = p.available;
                                        self.new_prod_image =
                                            p.image_url.clone().unwrap_or_default();
                                        self.image_path.clear();
                                    }
                                },
                            );
                        });
                    });
                    ui.add_space(8.0);
                }
            });
    }

    fn ui_admin_catégories(&mut self, ui: &mut egui::Ui) {
        card(ui, |ui| {
            ui.label(
                egui::RichText::new("Nouvelle catégorie")
                    .strong()
                    .size(15.0)
                    .color(TEXT),
            );
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut self.new_cat)
                        .desired_width(f32::INFINITY)
                        .hint_text("Ex. : Sandwichs")
                        .margin(egui::Margin::same(10)),
                );
                let name = self.new_cat.trim().to_string();
                ui.add_enabled_ui(!name.is_empty(), |ui| {
                    if btn_primary(ui, "Ajouter").clicked() {
                        if let Some(t) = self.token.clone() {
                            create_category(self.tx.clone(), t, name);
                        }
                        self.new_cat.clear();
                    }
                });
            });
        });

        ui.add_space(12.0);
        ui.horizontal(|ui| {
            ui.label(
                egui::RichText::new(format!("{} catégorie(s)", self.catégories.len()))
                    .color(MUTED)
                    .size(12.0),
            );
        });
        ui.add_space(6.0);

        let cats = self.catégories.clone();
        egui::ScrollArea::vertical()
            .id_salt("admin_cats")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                if cats.is_empty() {
                    empty_state(
                        ui,
                        Icon::Box,
                        "Aucune catégorie",
                        "Créez une catégorie ci-dessus.",
                    );
                }
                for c in &cats {
                    let c = c.clone();
                    let renaming = self.rename_id == Some(c.id);
                    card(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(
                                egui::RichText::new(&c.name).strong().size(14.0).color(TEXT),
                            );
                            ui.label(
                                egui::RichText::new(format!("{} produit(s)", c.products_count))
                                    .color(MUTED)
                                    .size(12.0),
                            );
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    if icon_btn(ui, Icon::Trash, alpha(RED, 34), RED, 32.0) {
                                        if let Some(t) = self.token.clone() {
                                            delete_category(self.tx.clone(), t, c.id);
                                        }
                                        if self.rename_id == Some(c.id) {
                                            self.rename_id = None;
                                        }
                                    }
                                    ui.add_space(6.0);
                                    if icon_btn(ui, Icon::Edit, GREY, TEXT, 32.0) {
                                        self.rename_id = Some(c.id);
                                        self.rename_buf = c.name.clone();
                                    }
                                },
                            );
                        });
                        if renaming {
                            ui.add_space(6.0);
                            ui.horizontal(|ui| {
                                ui.add(
                                    egui::TextEdit::singleline(&mut self.rename_buf)
                                        .desired_width(f32::INFINITY)
                                        .margin(egui::Margin::same(10)),
                                );
                                let new_name = self.rename_buf.trim().to_string();
                                ui.add_enabled_ui(!new_name.is_empty(), |ui| {
                                    if btn_primary(ui, "Valider").clicked() {
                                        if let Some(t) = self.token.clone() {
                                            rename_category(self.tx.clone(), t, c.id, new_name);
                                        }
                                        self.rename_id = None;
                                    }
                                });
                                if btn_ghost(ui, "Annuler").clicked() {
                                    self.rename_id = None;
                                }
                            });
                        }
                    });
                    ui.add_space(8.0);
                }
            });
    }
}

impl ShopApp {
    fn ui_finances(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            if btn_ghost(ui, "Rafraîchir").clicked() {
                if let Some(t) = self.token.clone() {
                    fetch_summary(self.tx.clone(), t.clone());
                    fetch_expenses(self.tx.clone(), t);
                }
            }
            ui.label(
                egui::RichText::new("Journal des ventes et des charges")
                    .color(MUTED)
                    .size(12.0),
            );
        });
        ui.add_space(8.0);

        egui::ScrollArea::vertical()
            .id_salt("finances")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                // Resume
                match &self.summary {
                    Some(s) => {
                        ui.horizontal_wrapped(|ui| {
                            for (label, val, sub, color) in [
                                ("Revenus", s.revenue_cents, format!("{} commande(s)", s.orders), TEXT),
                                ("Coûts", s.cost_cents, format!("{} unité(s)", s.units), TEXT),
                                (
                                    "Marge brute",
                                    s.gross_margin_cents,
                                    "Revenus - coûts".to_string(),
                                    GREEN,
                                ),
                                (
                                    "Dépenses",
                                    s.expenses_cents,
                                    format!("{} ligne(s)", s.expense_count),
                                    RED,
                                ),
                                ("Résultat net", s.net_cents, "Marge - dépenses".to_string(), ORANGE),
                            ] {
                                egui::Frame::new()
                                    .fill(SURFACE)
                                    .stroke(egui::Stroke::new(1.0_f32, glass(12)))
                                    .corner_radius(egui::CornerRadius::same(20))
                                    .inner_margin(egui::Margin::same(14))
                                    .show(ui, |ui| {
                                        ui.set_min_width(150.0);
                                        ui.label(
                                            egui::RichText::new(label)
                                                .size(11.0)
                                                .color(MUTED),
                                        );
                                        ui.label(
                                            egui::RichText::new(cents(val))
                                                .size(17.0)
                                                .strong()
                                                .color(color),
                                        );
                                        ui.label(
                                            egui::RichText::new(sub)
                                                .size(10.0)
                                                .color(alpha(MUTED, 200)),
                                        );
                                    });
                            }
                        });
                    }
                    None => {
                        card(ui, |ui| {
                            ui.label(
                                egui::RichText::new("Chargement du résumé...")
                                    .color(MUTED),
                            );
                        });
                    }
                }

                ui.add_space(12.0);
                section_title(ui, "Nouvelle dépense");
                card(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new("Libellé").color(MUTED).size(12.0));
                            ui.add(
                                egui::TextEdit::singleline(&mut self.new_exp_label)
                                    .desired_width(f32::INFINITY)
                                    .margin(egui::Margin::same(10)),
                            );
                        });
                        ui.add_space(8.0);
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new("Montant").color(MUTED).size(12.0));
                            ui.add(
                                egui::TextEdit::singleline(&mut self.new_exp_amount)
                                    .hint_text("25,00")
                                    .margin(egui::Margin::same(10)),
                            );
                        });
                        ui.add_space(8.0);
                        ui.vertical(|ui| {
                            ui.label(egui::RichText::new("Date").color(MUTED).size(12.0));
                            ui.add(
                                egui::TextEdit::singleline(&mut self.new_exp_date)
                                    .hint_text("2026-11-19")
                                    .margin(egui::Margin::same(10)),
                            );
                        });
                    });
                    ui.add_space(8.0);
                    let label = self.new_exp_label.trim().to_string();
                    let amount = euros_to_cents(&self.new_exp_amount);
                    ui.add_enabled_ui(!label.is_empty(), |ui| {
                        if btn_primary(ui, "Ajouter la dépense").clicked() {
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
                });

                ui.add_space(12.0);
                section_title(ui, "Dépenses");

                if self.expenses.is_empty() {
                    empty_state(
                        ui,
                        Icon::Wallet,
                        "Aucune dépense",
                        "Ajoutez vos charges pour calculer le résultat net.",
                    );
                    return;
                }
                let expenses = self.expenses.clone();
                for e in &expenses {
                    card(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.vertical(|ui| {
                                ui.label(
                                    egui::RichText::new(&e.label).strong().size(14.0).color(TEXT),
                                );
                                ui.label(
                                    egui::RichText::new(e.date.clone().unwrap_or_else(|| "-".into()))
                                        .color(MUTED)
                                        .size(11.0),
                                );
                            });
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    if icon_btn(ui, Icon::Trash, alpha(RED, 34), RED, 30.0) {
                                        if let Some(t) = self.token.clone() {
                                            delete_expense(self.tx.clone(), t, e.id);
                                        }
                                    }
                                    ui.add_space(8.0);
                                    ui.label(
                                        egui::RichText::new(cents(e.amount_cents))
                                            .strong()
                                            .size(14.0)
                                            .color(RED),
                                    );
                                },
                            );
                        });
                    });
                    ui.add_space(8.0);
                }
            });
    }

    /* ------------------------------------------------------------- chat */

    fn ui_chat(&mut self, ui: &mut egui::Ui) {
        let my_id = self.user.as_ref().map(|u| u.id);
        let token = self.token.clone();
        let tx = self.tx.clone();

        match self.chat_id {
            // --- Fil de discussion (style Android : ecran dedie) ---
            Some(id) => {
                ui.horizontal(|ui| {
                    if icon_btn(ui, Icon::Back, GREY, TEXT, 32.0) {
                        self.chat_id = None;
                        self.chat_messages.clear();
                        if let Some(t) = token.clone() {
                            fetch_conversations(tx.clone(), t);
                        }
                    }
                    ui.add_space(8.0);
                    let title = self
                        .conversations
                        .iter()
                        .find(|c| c.id == id)
                        .and_then(|c| c.customer.as_ref().and_then(|x| x.name.clone()))
                        .unwrap_or_else(|| format!("Conversation #{}", id));
                    ui.label(egui::RichText::new(title).strong().size(16.0).color(TEXT));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if btn_ghost(ui, "Actualiser").clicked() {
                            if let Some(t) = token.clone() {
                                fetch_messages(tx.clone(), t, id);
                            }
                        }
                    });
                });
                ui.add_space(6.0);
                ui.separator();
                ui.add_space(6.0);

                egui::ScrollArea::vertical()
                    .id_salt("chat_msgs")
                    .stick_to_bottom(true)
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        if self.chat_messages.is_empty() {
                            empty_state(
                                ui,
                                Icon::Chat,
                                "Aucun message",
                                "Envoyez le premier message !",
                            );
                        }
                        for m in &self.chat_messages {
                            let m = m.clone();
                            let mine = m.sender_id == my_id;
                            ui.horizontal(|ui| {
                                if mine {
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| chat_bubble(ui, &m, mine),
                                    );
                                } else {
                                    chat_bubble(ui, &m, mine);
                                }
                            });
                            ui.add_space(4.0);
                        }
                        ui.add_space(8.0);
                    });

                // Saisie
                ui.add_space(6.0);
                egui::Frame::new()
                    .fill(SURFACE)
                    .stroke(egui::Stroke::new(1.0_f32, glass(18)))
                    .corner_radius(egui::CornerRadius::same(20))
                    .inner_margin(egui::Margin::same(8))
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            let resp = ui.add(
                                egui::TextEdit::singleline(&mut self.chat_input)
                                    .desired_width(f32::INFINITY)
                                    .hint_text("Votre message...")
                                    .margin(egui::Margin::same(8)),
                            );
                            let enter = ui.input(|i| i.key_pressed(egui::Key::Enter))
                                && resp.has_focus()
                                && !self.chat_input.trim().is_empty();
                            let mut send_now = false;
                            ui.add_enabled_ui(!self.chat_input.trim().is_empty(), |ui| {
                                if btn_primary(ui, "Envoyer").clicked() {
                                    send_now = true;
                                }
                            });
                            if enter || send_now {
                                let body = self.chat_input.clone();
                                if let Some(t) = self.token.clone() {
                                    send_message(self.tx.clone(), t, id, body);
                                }
                                self.chat_input.clear();
                            }
                        });
                    });
                ui.add_space(8.0);
            }

            // --- Liste des conversations ---
            None => {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new("Messages").strong().size(18.0).color(TEXT),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if btn_ghost(ui, "Actualiser").clicked() {
                            if let Some(t) = token.clone() {
                                fetch_conversations(tx.clone(), t);
                            }
                        }
                    });
                });
                ui.add_space(8.0);

                egui::ScrollArea::vertical()
                    .id_salt("convs")
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        if self.conversations.is_empty() {
                            empty_state(
                                ui,
                                Icon::Chat,
                                "Aucune conversation",
                                "Les conversations avec vos clients apparaîtront ici.",
                            );
                        }
                        for c in &self.conversations {
                            let c = c.clone();
                            let name = c
                                .customer
                                .as_ref()
                                .and_then(|x| x.name.clone())
                                .unwrap_or_else(|| format!("Client #{}", c.id));
                            let preview = c
                                .last_message
                                .as_ref()
                                .and_then(|m| m.body.clone())
                                .unwrap_or_else(|| "...".into());
                            card(ui, |ui| {
                                ui.horizontal(|ui| {
                                    let (rect, _) = ui.allocate_exact_size(
                                        egui::vec2(40.0, 40.0),
                                        egui::Sense::hover(),
                                    );
                                    let p = ui.painter();
                                    p.circle_filled(rect.center(), 20.0, alpha(BLUE, 40));
                                    let initial =
                                        name.chars().next().unwrap_or('?').to_uppercase().to_string();
                                    p.text(
                                        rect.center(),
                                        egui::Align2::CENTER_CENTER,
                                        initial,
                                        egui::FontId::proportional(16.0),
                                        BLUE,
                                    );
                                    ui.add_space(10.0);
                                    let resp = ui.vertical(|ui| {
                                        ui.horizontal(|ui| {
                                            ui.label(
                                                egui::RichText::new(&name)
                                                    .strong()
                                                    .size(14.0)
                                                    .color(TEXT),
                                            );
                                            if c.unread_count > 0 {
                                                egui::Frame::new()
                                                    .fill(ORANGE)
                                                    .corner_radius(egui::CornerRadius::same(200))
                                                    .inner_margin(egui::Margin {
                                                        left: 7,
                                                        right: 7,
                                                        top: 1,
                                                        bottom: 1,
                                                    })
                                                    .show(ui, |ui| {
                                                        ui.label(
                                                            egui::RichText::new(format!(
                                                                "{}",
                                                                c.unread_count
                                                            ))
                                                            .color(egui::Color32::WHITE)
                                                            .strong()
                                                            .size(11.0),
                                                        );
                                                    });
                                            }
                                        });
                                        ui.label(
                                            egui::RichText::new(preview)
                                                .color(MUTED)
                                                .size(12.0),
                                        );
                                    })
                                    .response;
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            ui.label(
                                                egui::RichText::new(short_time(&c.updated_at))
                                                    .color(MUTED)
                                                    .size(11.0),
                                            );
                                        },
                                    );
                                    if resp.clicked() || resp.secondary_clicked() {
                                        self.chat_id = Some(c.id);
                                        self.chat_messages.clear();
                                        if let Some(t) = token.clone() {
                                            fetch_messages(tx.clone(), t.clone(), c.id);
                                            mark_read(t, c.id);
                                        }
                                    }
                                });
                            });
                            ui.add_space(8.0);
                        }
                    });
            }
        }
    }
}

fn chat_bubble(ui: &mut egui::Ui, m: &ChatMessage, mine: bool) {
    egui::Frame::new()
        .fill(if mine { ORANGE } else { GREY })
        .corner_radius(egui::CornerRadius::same(16))
        .inner_margin(egui::Margin::same(10))
        .show(ui, |ui| {
            ui.set_max_width(460.0);
            if !mine {
                if let Some(n) = &m.sender_name {
                    ui.label(
                        egui::RichText::new(n)
                            .size(10.0)
                            .strong()
                            .color(alpha(egui::Color32::WHITE, 200)),
                    );
                }
            }
            ui.label(egui::RichText::new(&m.body).color(egui::Color32::WHITE));
            ui.label(
                egui::RichText::new(short_time(&m.created_at))
                    .size(9.0)
                    .color(alpha(egui::Color32::WHITE, 170)),
            );
        });
}

/* ----------------------------------------------------- boucle principale */

impl eframe::App for ShopApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // ---- messages des threads ----
        while let Ok(m) = self.rx.try_recv() {
            match m {
                Msg::LoginOk(u, t) => {
                    self.user = Some(u);
                    self.token = Some(t);
                    self.busy = false;
                    self.screen = Screen::Boutique;
                    self.set_notice("Connecté");
                    fetch_products(self.tx.clone(), self.token.clone());
                    fetch_catégories(self.tx.clone(), self.token.clone());
                    self.reload_orders();
                    self.last_poll = Some(Instant::now());
                }
                Msg::LoginErr(e) => {
                    self.busy = false;
                    self.set_notice(e);
                }
                Msg::RoleUpdated(u) => {
                    let now_supplier = u.is_supplier();
                    self.user = Some(u);
                    self.screen = Screen::Profile;
                    if now_supplier {
                        self.admin_tab = 0;
                        self.set_notice("Mode fournisseur activé");
                        fetch_products(self.tx.clone(), self.token.clone());
                        fetch_catégories(self.tx.clone(), self.token.clone());
                        self.reload_orders();
                    } else {
                        self.set_notice("Mode fournisseur désactivé");
                        self.conversations.clear();
                        self.chat_id = None;
                        self.chat_messages.clear();
                        self.summary = None;
                        self.expenses.clear();
                        if matches!(self.screen, Screen::Admin | Screen::Finances | Screen::Chat) {
                            self.screen = Screen::Profile;
                        }
                    }
                }
                Msg::Products(p) => self.products = p,
                Msg::Orders(o) => self.orders = o,
                Msg::Summary(s) => self.summary = Some(s),
                Msg::Expenses(e) => self.expenses = e,
                Msg::Catégories(c) => self.catégories = c,
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
                Msg::Unauthorized => {
                    self.logout();
                    self.set_notice("Session expirée, reconnectez-vous.");
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

        // ---- rafraichissement automatique ----
        if self.token.is_some() {
            let due = self
                .last_poll
                .map(|t| t.elapsed() >= Duration::from_secs(4))
                .unwrap_or(true);
            if due {
                match self.screen {
                    Screen::Boutique => {
                        fetch_products(self.tx.clone(), self.token.clone());
                        fetch_catégories(self.tx.clone(), self.token.clone());
                    }
                    Screen::Orders => self.reload_orders(),
                    Screen::Chat => {
                        if let Some(t) = self.token.clone() {
                            fetch_conversations(self.tx.clone(), t.clone());
                            if let Some(id) = self.chat_id {
                                fetch_messages(self.tx.clone(), t, id);
                            }
                        }
                    }
                    Screen::Admin => {
                        fetch_products(self.tx.clone(), self.token.clone());
                        fetch_catégories(self.tx.clone(), self.token.clone());
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
        }

        // ---- notification expiree ----
        let expired = self
            .notice_at
            .map(|t| t.elapsed() >= Duration::from_secs(5))
            .unwrap_or(false);
        if expired {
            self.notice = None;
            self.notice_at = None;
        }

        // ---- barre superieure (glass) ----
        let notice = self.notice.clone();
        let update = (self.update_version.clone(), self.update_url.clone());
        let user = self.user.clone();
        egui::TopBottomPanel::top("top")
            .frame(
                egui::Frame::new()
                    .fill(glass(18))
                    .stroke(egui::Stroke::new(1.0_f32, glass(24)))
                    .inner_margin(egui::Margin {
                        left: 16,
                        right: 16,
                        top: 10,
                        bottom: 10,
                    }),
            )
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    let (rect, _) =
                        ui.allocate_exact_size(egui::vec2(26.0, 26.0), egui::Sense::hover());
                    draw_icon(ui.painter(), Icon::Bag, rect, ORANGE, 2.2);
                    ui.add_space(8.0);
                    ui.label(
                        egui::RichText::new("ShopTaBouffe")
                            .size(18.0)
                            .strong()
                            .color(ORANGE),
                    );
                    if let Some(u) = &user {
                        ui.label(
                            egui::RichText::new(format!("· {}", u.name)).color(MUTED).size(13.0),
                        );
                        if u.is_supplier() {
                            egui::Frame::new()
                                .fill(alpha(ORANGE, 36))
                                .corner_radius(egui::CornerRadius::same(200))
                                .inner_margin(egui::Margin {
                                    left: 9,
                                    right: 9,
                                    top: 2,
                                    bottom: 2,
                                })
                                .show(ui, |ui| {
                                    ui.label(
                                        egui::RichText::new("Fournisseur")
                                            .color(ORANGE)
                                            .strong()
                                            .size(11.0),
                                    );
                                });
                        }
                    }
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if user.is_some() {
                            if btn_ghost(ui, "Déconnexion").clicked() {
                                self.logout();
                            }
                        }
                        ui.label(
                            egui::RichText::new(format!("v{}", APP_VERSION))
                                .color(MUTED)
                                .size(11.0),
                        );
                    });
                });

                // Banniere de mise a jour
                if let (Some(v), Some(u)) = update {
                    ui.add_space(6.0);
                    egui::Frame::new()
                        .fill(alpha(AMBER, 28))
                        .corner_radius(egui::CornerRadius::same(14))
                        .inner_margin(egui::Margin::same(10))
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                let (r, _) = ui.allocate_exact_size(
                                    egui::vec2(18.0, 18.0),
                                    egui::Sense::hover(),
                                );
                                draw_icon(ui.painter(), Icon::Check, r, AMBER, 2.5);
                                ui.label(
                                    egui::RichText::new(format!(
                                        "Mise à jour disponible : v{}",
                                        v
                                    ))
                                    .color(AMBER)
                                    .strong(),
                                );
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        if btn_ghost(ui, "Plus tard").clicked() {
                                            self.update_version = None;
                                            self.update_url = None;
                                        }
                                        let tx = self.tx.clone();
                                        let url = u.clone();
                                        if btn_primary(ui, "Télécharger et installer").clicked() {
                                            thread::spawn(move || {
                                                let path = std::env::temp_dir()
                                                    .join("ShopTaBouffe-Update.exe");
                                                match reqwest::blocking::Client::new()
                                                    .get(&url)
                                                    .send()
                                                {
                                                    Ok(r) => {
                                                        if let Ok(bytes) = r.bytes() {
                                                            if std::fs::write(&path, &bytes).is_ok() {
                                                                let _ = tx.send(Msg::Notice(
                                                                    "Mise à jour : l'application va redémarrer..."
                                                                        .into(),
                                                                ));
                                                                let _ = tx.send(Msg::ExitApp);
                                                                use std::os::windows::process::CommandExt;
                                                                const CREATE_NO_WINDOW: u32 =
                                                                    0x0800_0000;
                                                                let line = format!(
                                                                    "timeout /t 2 /nobreak >nul 2>&1 && start \"\" \"{}\"",
                                                                    path.display()
                                                                );
                                                                let _ = std::process::Command::new(
                                                                    "cmd",
                                                                )
                                                                .arg("/C")
                                                                .arg(line)
                                                                .creation_flags(CREATE_NO_WINDOW)
                                                                .spawn();
                                                            } else {
                                                                let _ = tx.send(Msg::Error(
                                                                    "Écriture du fichier impossible."
                                                                        .into(),
                                                                ));
                                                            }
                                                        }
                                                    }
                                                    Err(e) => {
                                                        let _ =
                                                            tx.send(Msg::Error(e.to_string()));
                                                    }
                                                }
                                            });
                                        }
                                    },
                                );
                            });
                        });
                }

                // Bandeau de notification
                if let Some(n) = notice {
                    ui.add_space(6.0);
                    egui::Frame::new()
                        .fill(alpha(ORANGE, 26))
                        .corner_radius(egui::CornerRadius::same(14))
                        .inner_margin(egui::Margin::same(8))
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                let (r, _) = ui.allocate_exact_size(
                                    egui::vec2(16.0, 16.0),
                                    egui::Sense::hover(),
                                );
                                draw_icon(ui.painter(), Icon::Check, r, ORANGE, 2.5);
                                ui.label(egui::RichText::new(n).color(TEXT).size(13.0));
                            });
                        });
                }
            });

        // ---- navigation inferieure ----
        if self.user.is_some() {
            let supplier = self.is_supplier();
            let can_chat = self.can_chat();
            let cart_qty = self.cart_qty();
            let current = self.screen;

            let mut items: Vec<(Icon, &'static str, Screen)> =
                vec![(Icon::Store, "Boutique", Screen::Boutique)];
            if !supplier {
                items.push((Icon::Cart, "Panier", Screen::Cart));
            }
            items.push((Icon::Receipt, "Commandes", Screen::Orders));
            if can_chat {
                items.push((Icon::Chat, "Messages", Screen::Chat));
            }
            if supplier {
                items.push((Icon::Box, "Produits", Screen::Admin));
                items.push((Icon::Wallet, "Finances", Screen::Finances));
            }
            items.push((Icon::Person, "Profil", Screen::Profile));

            egui::TopBottomPanel::bottom("nav")
                .exact_height(66.0)
                .frame(
                    egui::Frame::new()
                        .fill(glass(18))
                        .stroke(egui::Stroke::new(1.0_f32, glass(24)))
                        .inner_margin(egui::Margin::same(4)),
                )
                .show(ctx, |ui| {
                    let n = items.len() as f32;
                    let w = ui.available_width() / n;
                    ui.spacing_mut().item_spacing.x = 0.0;
                    ui.horizontal(|ui| {
                        for (ic, label, scr) in items {
                            let (rect, resp) = ui.allocate_exact_size(
                                egui::vec2(w, 58.0),
                                egui::Sense::click(),
                            );
                            let selected = current == scr;
                            let color = if selected { ORANGE } else { MUTED };
                            let p = ui.painter();

                            if selected {
                                let ind = egui::Rect::from_center_size(
                                    egui::pos2(rect.center().x, rect.top() + 4.0),
                                    egui::vec2(30.0, 4.0),
                                );
                                p.rect_filled(ind, egui::CornerRadius::same(2), ORANGE);
                            }

                            let icon_rect = egui::Rect::from_center_size(
                                egui::pos2(rect.center().x, rect.top() + 26.0),
                                egui::vec2(24.0, 24.0),
                            );
                            draw_icon(p, ic, icon_rect, color, 2.0);

                            p.text(
                                egui::pos2(rect.center().x, rect.top() + 42.0),
                                egui::Align2::CENTER_TOP,
                                label,
                                egui::FontId::proportional(11.0),
                                color,
                            );

                            // Badge du panier
                            if scr == Screen::Cart && cart_qty > 0 {
                                let c = egui::pos2(icon_rect.right() - 2.0, icon_rect.top() + 2.0);
                                p.circle_filled(c, 9.0, ORANGE);
                                p.text(
                                    c,
                                    egui::Align2::CENTER_CENTER,
                                    format!("{}", cart_qty),
                                    egui::FontId::proportional(10.0),
                                    egui::Color32::WHITE,
                                );
                            }

                            if resp.clicked() {
                                self.screen = scr;
                                self.on_screen_change();
                            }
                        }
                    });
                });
        }

        // ---- contenu ----
        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(BG))
            .show(ctx, |ui| {
                // fond + halo de couleur (fake degrade)
                let rect = ui.max_rect();
                let p = ui.painter();
                p.rect_filled(rect, 0, BG);
                p.circle_filled(
                    egui::pos2(rect.right() - 120.0, rect.top() + 40.0),
                    280.0,
                    alpha(ORANGE, 14),
                );
                p.circle_filled(
                    egui::pos2(rect.left() + 60.0, rect.bottom() - 20.0),
                    260.0,
                    alpha(PURPLE, 14),
                );

                ui.add_space(8.0);
                egui::Frame::new()
                    .inner_margin(egui::Margin {
                        left: 20,
                        right: 20,
                        top: 4,
                        bottom: 4,
                    })
                    .show(ui, |ui| match self.screen {
                        Screen::Login => self.ui_login(ui),
                        Screen::Boutique => self.ui_boutique(ui),
                        Screen::Cart => self.ui_cart(ui),
                        Screen::Orders => self.ui_orders(ui),
                        Screen::Profile => self.ui_profile(ui),
                        Screen::Admin => self.ui_admin(ui),
                        Screen::Finances => self.ui_finances(ui),
                        Screen::Chat => self.ui_chat(ui),
                    });
            });

        // Garde-fou : le chat reste reserve aux comptes autorises.
        if self.screen == Screen::Chat && !self.can_chat() {
            self.screen = Screen::Profile;
            self.set_notice("Chat réservé aux comptes GitHub ou Google.");
        }

        ctx.request_repaint_after(Duration::from_secs(1));
    }
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1280.0, 860.0])
            .with_min_inner_size([860.0, 600.0]),
        ..Default::default()
    };
    eframe::run_native(
        "ShopTaBouffe",
        options,
        Box::new(|cc| {
            let mut style = (*cc.egui_ctx.style()).clone();
            style.visuals = egui::Visuals::dark();
            style.visuals.override_text_color = Some(TEXT);
            style.visuals.panel_fill = BG;
            style.visuals.window_fill = SURFACE;
            style.visuals.extreme_bg_color = GREY;
            style.visuals.selection.bg_fill = ORANGE;
            style.visuals.selection.stroke = egui::Stroke::new(1.0_f32, egui::Color32::WHITE);
            style.visuals.hyperlink_color = ORANGE;
            style.visuals.widgets.noninteractive.bg_fill = GREY;
            style.visuals.widgets.noninteractive.fg_stroke =
                egui::Stroke::new(1.0_f32, TEXT);
            style.visuals.widgets.noninteractive.bg_stroke =
                egui::Stroke::new(1.0_f32, glass(24));
            style.visuals.widgets.inactive.bg_fill = GREY;
            style.visuals.widgets.inactive.fg_stroke = egui::Stroke::new(1.0_f32, TEXT);
            style.visuals.widgets.inactive.bg_stroke =
                egui::Stroke::new(1.0_f32, glass(30));
            style.visuals.widgets.hovered.bg_fill =
                egui::Color32::from_rgb(41, 45, 56);
            style.visuals.widgets.hovered.fg_stroke = egui::Stroke::new(1.0_f32, TEXT);
            style.visuals.widgets.active.bg_fill = ORANGE;
            style.visuals.widgets.active.fg_stroke =
                egui::Stroke::new(1.0_f32, egui::Color32::WHITE);
            style.spacing.item_spacing = egui::vec2(8.0, 8.0);
            style.spacing.button_padding = egui::vec2(14.0, 8.0);
            style.spacing.item_spacing.y = 8.0;
            cc.egui_ctx.set_style(style);
            Ok(Box::new(ShopApp::default()))
        }),
    )
}
