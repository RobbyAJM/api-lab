use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://root:root@localhost:5432/api_lab?sslmode=disable".into());

    println!("Connecting to {db_url}...");
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await?;

    println!("Running migrations...");
    sqlx::migrate!("../../migrations").run(&pool).await?;
    println!("Migrations applied successfully!");
    Ok(())
}
