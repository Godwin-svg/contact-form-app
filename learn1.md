# Contact Form - Quick Setup Guide

## Setup Steps

1. **Create Security Groups**
   - EC2 Instance Connect Endpoint SG (SSH to VPC)
   - ALB SG (HTTP/HTTPS from internet)
   - EC2 SG (HTTP/HTTPS from ALB, SSH from Instance Connect)
   - RDS SG (MySQL from EC2 only)

2. **Create RDS MySQL Database**
   - Save: endpoint, port, username, password, database name

3. **Create S3 Bucket**
   - Save: bucket name

4. **Store Password in Secrets Manager**
   - Name: `contact-form/rds-password`
   - Value: `{"password": "YourPassword123!"}`

5. **Create 6 Parameters in Parameter Store**
   - See table below

6. **Create IAM Policy + Role**
   - Attach policy to role
   - Assign role to EC2

7. **Launch EC2 with IAM Role**
   - Install Node.js, deploy app

8. **Create ALB**
   - Point to EC2, configure health checks

---

## IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameters"],
      "Resource": "arn:aws:ssm:*:*:parameter/contact-form/*"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:*:*:secret:contact-form/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    }
  ]
}
```

**Why Each Permission:**

- `ssm:GetParameters` - Read config at startup
- `secretsmanager:GetSecretValue` - Get DB password
- `s3:PutObject` - Upload files

---

## Parameter Store Values

| Parameter Name                         | Value Example                             |
| -------------------------------------- | ----------------------------------------- |
| `/contact-form/S3_BUCKET_NAME`         | `my-contact-uploads`                      |
| `/contact-form/RDS_HOST`               | `mydb.abc123.us-east-1.rds.amazonaws.com` |
| `/contact-form/RDS_PORT`               | `3306`                                    |
| `/contact-form/RDS_USER`               | `admin`                                   |
| `/contact-form/RDS_PASSWORD_SECRET_ID` | `contact-form/rds-password`               |
| `/contact-form/RDS_DATABASE`           | `contactformdb`                           |

Optional: `/contact-form/MAX_FILE_SIZE_BYTES` → `10485760`

---

## Security Groups

**EC2 Instance Connect SG:** Outbound SSH (22) to VPC  
**ALB SG:** Inbound 80/443 from 0.0.0.0/0  
**EC2 SG:** Inbound 80/443 from ALB, SSH from Instance Connect | Outbound All  
**RDS SG:** Inbound 3306 from EC2

---

## Testing

**Local (No AWS):**

```bash
DEMO_MODE=true npm start
```

**Local with AWS:**

```bash
npm install
export AWS_REGION=us-east-1
npm start
curl http://localhost:3000/api/health
```

**EC2 Deploy:**

```bash
# Install Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18

# Deploy
git clone YOUR-REPO && cd YOUR-REPO
npm install
npm install -g pm2
pm2 start server.js --name contact-form
pm2 startup && pm2 save
```

**Check Logs:**

```bash
pm2 logs contact-form
pm2 logs contact-form --lines 100
```

---

## Troubleshooting

| Issue                | Fix                                          |
| -------------------- | -------------------------------------------- |
| Access Denied (SSM)  | Add `ssm:GetParameters` to IAM               |
| Access Denied (S3)   | Add `s3:PutObject` to IAM                    |
| Can't connect to RDS | Check Security Group (EC2→RDS 3306)          |
| ALB 503 error        | Check EC2 app running: `pm2 status`          |
| Target unhealthy     | Verify app on port 3000, check `/api/health` |

---

## Traffic Flow

```
Internet → ALB (80/443) → EC2 (80/443) → RDS (3306)
                       → EC2 → S3/SSM/Secrets APIs
```
