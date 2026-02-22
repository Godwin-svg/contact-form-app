# Contact Form Application with AWS Integration

A full-stack contact form application built with Node.js and Express, featuring file uploads to S3, data persistence in RDS MySQL, and configuration management through AWS Parameter Store and Secrets Manager.

## Architecture

```
Frontend (AWS Amplify) - Auto-deploys on git push
    ↓ HTTPS
Custom Domain + SSL
    ↓
Application Load Balancer
    ↓ Port 3000
EC2 Instance (Docker)
    ↓
    ├─→ S3 (File Storage)
    └─→ RDS MySQL (Data Storage)
```

**Frontend:** Built and hosted on AWS Amplify, which automatically deploys the latest code from the repository whenever changes are pushed to the main branch.

## Features

- Contact form with file upload capability
- Secure credential management (AWS Secrets Manager)
- File storage in S3 with organized folder structure
- Data persistence in RDS MySQL database
- Health check endpoint for monitoring
- Containerized deployment with Docker
- HTTPS with custom domain and SSL certificate
- Comprehensive request logging

## Technologies

**Backend:**

- Node.js v18.x
- Express.js
- AWS SDK v3 (S3, Secrets Manager, Parameter Store)
- MySQL2
- Multer (file upload handling)

**Infrastructure:**

- AWS EC2 (Amazon Linux 2023)
- AWS RDS (MySQL)
- AWS S3
- AWS Application Load Balancer
- AWS Systems Manager (Parameter Store)
- AWS Secrets Manager
- AWS Amplify (Frontend hosting with automatic deployment)
- Docker

**Deployment:**

- Docker with multi-stage builds
- Alpine Linux base image
- Non-root user for security
- Health checks integrated

## Prerequisites

- AWS Account
- Domain name (for custom HTTPS endpoint)
- AWS CLI configured
- Docker (for containerized deployment)
- Git

## Deployment Steps

### 1. AWS Resources Setup

Create the following AWS resources:

- **VPC** with public and private subnets
- **RDS MySQL** database in private subnet
- **S3 bucket** for file uploads
- **Application Load Balancer** with SSL certificate
- **EC2 instance** (Amazon Linux 2023) with IAM role
- **Parameter Store** values for configuration
- **Secrets Manager** secret for database password

### 2. IAM Permissions

Attach IAM policy to EC2 role with permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameters",
        "secretsmanager:GetSecretValue",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:ssm:*:*:parameter/contact-form/*",
        "arn:aws:secretsmanager:*:*:secret:your-secret-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

### 3. Configure Parameter Store

Create parameters under `/contact-form/`:

- `S3_BUCKET_NAME`
- `RDS_HOST`
- `RDS_PORT`
- `RDS_USER`
- `RDS_PASSWORD_SECRET_ID`
- `RDS_DATABASE`
- `MAX_FILE_SIZE_BYTES`

### 4. Deploy Application on EC2

```bash
# Install required packages
sudo dnf install git docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Clone repository
git clone https://github.com/Godwin-svg/contact-form-app.git
cd contact-form-app

# Install dependencies
npm install

# Build Docker image
docker build -t nodeapp:1.0 .

# Run container
docker run -d \
  -p 3000:3000 \
  --restart unless-stopped \
  --name nodeapp \
  nodeapp:1.0
```

### 5. Deploy Frontend on Amplify

- Connect GitHub repository to AWS Amplify
- Amplify automatically builds and deploys on every git push
- Configure custom domain for frontend (optional)
- Update API endpoint in `public/index.html` to backend custom domain

### 6. Configure Backend Custom Domain

- Request SSL certificate in AWS Certificate Manager
- Add HTTPS listener to ALB with certificate
- Configure DNS (Route 53 or external) to point to ALB

### 7. Verify Deployment

```bash
# Check container status
docker ps

# Test backend health endpoint
curl http://localhost:3000/api/health

# Test via custom domain
curl https://your-backend-domain.com/api/health

# Frontend automatically available at Amplify URL
# Any git push to main branch triggers automatic redeployment
```

## Testing

1. Open frontend URL
2. Fill out contact form with all fields
3. Attach a file (optional)
4. Submit form
5. Verify success message appears
6. Check S3 bucket for uploaded file
7. Check RDS database for form submission record

**Expected Response:**

```json
{
  "ok": true,
  "message": "Contact form submitted successfully.",
  "data": {
    "id": 1,
    "fileUrl": "https://bucket.s3.region.amazonaws.com/path/to/file"
  }
}
```

## Monitoring

**View real-time logs:**

```bash
docker logs -f nodeapp
```

**Check container health:**

```bash
docker ps
docker inspect nodeapp | grep -A 10 "Health"
```

## Security Features

- No hardcoded credentials (AWS Secrets Manager)
- IAM roles for secure AWS access
- Non-root user in Docker container
- HTTPS with SSL/TLS encryption
- Security groups limiting access
- Private subnet for database
- Parameter Store for configuration management

## Project Structure

```
.
├── server.js           # Main application entry point
├── package.json        # Node.js dependencies
├── Dockerfile          # Docker configuration
├── .dockerignore       # Docker build exclusions
├── public/             # Frontend static files
│   └── index.html      # Contact form UI
├── learn.md            # Detailed setup guide
├── troubleshoot.md     # Error resolution guide
└── DOCKER.md           # Docker deployment guide
```

## Common Issues

| Issue                      | Solution                                                        |
| -------------------------- | --------------------------------------------------------------- |
| 502 Bad Gateway            | Check if Docker container is running: `docker ps`               |
| Port already in use        | Stop other services on port 3000: `docker stop nodeapp`         |
| IAM permission denied      | Verify EC2 role has required permissions                        |
| Database connection failed | Check RDS security group allows EC2 access                      |
| File upload failed         | Verify S3 bucket name in Parameter Store has no trailing spaces |

## Updating the Application

**Backend (Manual deployment):**

```bash
# Pull latest code
git pull origin main

# Rebuild Docker image
docker build -t nodeapp:1.0 .

# Restart container
docker stop nodeapp && docker rm nodeapp
docker run -d -p 3000:3000 --restart unless-stopped --name nodeapp nodeapp:1.0
```

**Frontend (Automatic deployment):**

```bash
# Simply push changes to GitHub
git add public/
git commit -m "Update frontend"
git push origin main

# Amplify automatically detects changes and redeploys
# No manual intervention needed!
```

## Live Demo

- **Frontend:** https://frontend-contact-form.godwintechservices.com/

## Author

Innocent Godwin

## License

ISC

## Acknowledgments

- AWS Documentation
- Node.js Community
- Docker Community

---

**Note:** This project demonstrates full-stack AWS integration with security best practices. All sensitive credentials are managed through AWS Secrets Manager and Parameter Store, never hardcoded.
