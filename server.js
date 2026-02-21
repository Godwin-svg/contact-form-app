// Import dependencies
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const mysql = require("mysql2/promise");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SSMClient, GetParametersCommand } = require("@aws-sdk/client-ssm");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

const port = Number(process.env.PORT || 3000);
const DEMO_MODE = process.env.DEMO_MODE === "true";

// Parameter Store paths for configuration
const parameterNames = {
  s3BucketName:
    process.env.SSM_S3_BUCKET_NAME || "/contact-form/S3_BUCKET_NAME",
  rdsHost: process.env.SSM_RDS_HOST || "/contact-form/RDS_HOST",
  rdsPort: process.env.SSM_RDS_PORT || "/contact-form/RDS_PORT",
  rdsUser: process.env.SSM_RDS_USER || "/contact-form/RDS_USER",
  rdsPasswordSecretId:
    process.env.SSM_RDS_PASSWORD_SECRET_ID ||
    "/contact-form/RDS_PASSWORD_SECRET_ID",
  rdsDatabase: process.env.SSM_RDS_DATABASE || "/contact-form/RDS_DATABASE",
  kmsKeyId: process.env.SSM_KMS_KEY_ID || "/contact-form/KMS_KEY_ID",
  maxFileSizeBytes:
    process.env.SSM_MAX_FILE_SIZE_BYTES || "/contact-form/MAX_FILE_SIZE_BYTES",
};

// Generate unique S3 key for uploaded files
function buildS3ObjectKey(originalName) {
  const extension = path.extname(originalName || "").toLowerCase();
  const random = crypto.randomBytes(16).toString("hex");
  return `contact-uploads/${Date.now()}-${random}${extension}`;
}

// Fetch AWS region from EC2 metadata or fallback to us-east-1
async function getAwsRegion() {
  // Try environment variables first
  if (process.env.AWS_REGION) return process.env.AWS_REGION;
  if (process.env.AWS_DEFAULT_REGION) return process.env.AWS_DEFAULT_REGION;

  // Try EC2 metadata service
  try {
    const response = await fetch(
      "http://169.254.169.254/latest/meta-data/placement/region",
      { signal: AbortSignal.timeout(2000) },
    );
    if (response.ok) {
      const region = await response.text();
      if (region) return region.trim();
    }
  } catch (_error) {
    // EC2 metadata not available (local environment)
  }

  // Default to us-east-1
  return "us-east-1";
}

// Load configuration from AWS Parameter Store
async function loadRuntimeConfigFromParameterStore() {
  const awsRegion = await getAwsRegion();

  const ssmClient = new SSMClient({ region: awsRegion });

  const requiredNames = [
    parameterNames.s3BucketName,
    parameterNames.rdsHost,
    parameterNames.rdsPort,
    parameterNames.rdsUser,
    parameterNames.rdsPasswordSecretId,
    parameterNames.rdsDatabase,
  ];

  const allNames = [
    ...requiredNames,
    parameterNames.kmsKeyId,
    parameterNames.maxFileSizeBytes,
  ];
  const response = await ssmClient.send(
    new GetParametersCommand({
      Names: allNames,
      WithDecryption: true,
    }),
  );

  const valuesByName = new Map(
    (response.Parameters || []).map((parameter) => [
      parameter.Name,
      parameter.Value,
    ]),
  );

  const missingRequired = requiredNames.filter(
    (name) => !valuesByName.get(name),
  );
  if (missingRequired.length) {
    throw new Error(
      `Missing required SSM parameters: ${missingRequired.join(", ")}`,
    );
  }

  return {
    awsRegion,
    s3BucketName: valuesByName.get(parameterNames.s3BucketName),
    rdsHost: valuesByName.get(parameterNames.rdsHost),
    rdsPort: Number(valuesByName.get(parameterNames.rdsPort) || 3306),
    rdsUser: valuesByName.get(parameterNames.rdsUser),
    rdsPasswordSecretId: valuesByName.get(parameterNames.rdsPasswordSecretId),
    rdsDatabase: valuesByName.get(parameterNames.rdsDatabase),
    kmsKeyId: valuesByName.get(parameterNames.kmsKeyId) || null,
    maxFileSizeBytes: Number(
      valuesByName.get(parameterNames.maxFileSizeBytes) || 10 * 1024 * 1024,
    ),
  };
}

// Extract password from Secrets Manager (supports plaintext or JSON)
function extractPasswordFromSecretText(secretText) {
  try {
    const parsed = JSON.parse(secretText);
    const candidate =
      parsed.password || parsed.dbPassword || parsed.RDS_PASSWORD;
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  } catch (_error) {
    if (typeof secretText === "string" && secretText.length > 0) {
      return secretText;
    }
  }

  throw new Error(
    "RDS password secret format is invalid. Provide plaintext or JSON with password field.",
  );
}

// Retrieve database password from AWS Secrets Manager
async function loadDbPasswordFromSecretsManager(secretClient, secretId) {
  const response = await secretClient.send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );

  if (response.SecretString) {
    return extractPasswordFromSecretText(response.SecretString);
  }

  if (response.SecretBinary) {
    const decoded = Buffer.from(response.SecretBinary, "base64").toString(
      "utf8",
    );
    return extractPasswordFromSecretText(decoded);
  }

  throw new Error("No secret value found for configured DB password secret.");
}

// Main server initialization
async function startServer() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "public")));

  // Demo mode - serve UI only without AWS/DB
  if (DEMO_MODE) {
    console.log("Running in DEMO MODE - UI only, no database");

    app.get("/api/health", (_req, res) => {
      res.json({ ok: false, message: "Demo mode - no database configured" });
    });

    app.post("/api/contact", (_req, res) => {
      res.status(503).json({
        ok: false,
        message:
          "Demo mode - form submission disabled. Configure AWS to enable.",
      });
    });

    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });

    app.listen(port, () => {
      console.log(`Demo server running on http://localhost:${port}`);
    });
    return;
  }

  // Production mode - full AWS integration
  const config = await loadRuntimeConfigFromParameterStore();

  // Initialize AWS clients
  const s3Client = new S3Client({ region: config.awsRegion });
  const secretsClient = new SecretsManagerClient({ region: config.awsRegion });
  const rdsPassword = await loadDbPasswordFromSecretsManager(
    secretsClient,
    config.rdsPasswordSecretId,
  );

  // Create MySQL connection pool
  const dbPool = mysql.createPool({
    host: config.rdsHost,
    port: config.rdsPort,
    user: config.rdsUser,
    password: rdsPassword,
    database: config.rdsDatabase,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // Configure file upload handler
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.maxFileSizeBytes,
    },
  });

  let tableInitialized = false;

  // Auto-create database table on first submission
  async function ensureContactTableExists() {
    if (tableInitialized) {
      return;
    }

    const createTableSql = `
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        full_name VARCHAR(120) NOT NULL,
        email VARCHAR(190) NOT NULL,
        subject VARCHAR(180) NOT NULL,
        message TEXT NOT NULL,
        file_url VARCHAR(1024) NULL,
        file_key VARCHAR(512) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_contact_email (email),
        INDEX idx_contact_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    await dbPool.execute(createTableSql);
    tableInitialized = true;
  }

  // Setup middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "public")));

  // Health check endpoint
  app.get("/api/health", async (_req, res) => {
    try {
      await dbPool.query("SELECT 1");
      res.json({ ok: true, message: "Service is healthy" });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: "Database connection failed",
        error: error.message,
      });
    }
  });

  // Contact form submission endpoint
  app.post("/api/contact", upload.single("attachment"), async (req, res) => {
    try {
      const { fullName, email, subject, message } = req.body;

      if (!fullName || !email || !subject || !message) {
        return res.status(400).json({
          ok: false,
          message: "Please provide full name, email, subject, and message.",
        });
      }

      await ensureContactTableExists();

      // Handle file upload to S3
      let fileUrl = null;
      let fileKey = null;

      if (req.file) {
        fileKey = buildS3ObjectKey(req.file.originalname);

        // Build S3 upload command with optional KMS encryption
        const uploadParams = {
          Bucket: config.s3BucketName,
          Key: fileKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype || "application/octet-stream",
        };

        // Add KMS encryption if key is configured
        if (config.kmsKeyId) {
          uploadParams.ServerSideEncryption = "aws:kms";
          uploadParams.SSEKMSKeyId = config.kmsKeyId;
        }

        await s3Client.send(new PutObjectCommand(uploadParams));

        fileUrl = `https://${config.s3BucketName}.s3.${config.awsRegion}.amazonaws.com/${fileKey}`;
      }

      // Save to database
      const insertSql = `
        INSERT INTO contact_submissions (full_name, email, subject, message, file_url, file_key)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const [result] = await dbPool.execute(insertSql, [
        fullName.trim(),
        email.trim(),
        subject.trim(),
        message.trim(),
        fileUrl,
        fileKey,
      ]);

      return res.status(201).json({
        ok: true,
        message: "Contact form submitted successfully.",
        data: {
          id: result.insertId,
          fileUrl,
        },
      });
    } catch (error) {
      console.error("Submission error:", error);
      return res.status(500).json({
        ok: false,
        message: "Could not submit contact form. Please try again.",
        error: error.message,
      });
    }
  });

  // Serve frontend for all other routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

// Start the server
startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
