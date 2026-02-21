# Troubleshooting Guide - Contact Form Deployment

This document contains all errors encountered during deployment and their solutions.

---

## **Error 1: Git Command Not Found on EC2**

### **Problem:**

```bash
[ec2-user@ip-10-0-2-215 ~]$ git clone git@github.com:Godwin-svg/contact-form-app.git
-bash: git: command not found
```

### **Cause:**

Git is not installed by default on Amazon Linux 2023.

### **Solution:**

```bash
# Install git using dnf (AL2023 package manager)
sudo dnf install git -y

# Verify installation
git --version
```

**Result:** ✅ Git installed successfully

---

## **Error 2: SSH Host Authenticity Verification**

### **Problem:**

```bash
The authenticity of host 'github.com (140.82.114.4)' can't be established.
ED25519 key fingerprint is SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU.
Are you sure you want to continue connecting (yes/no/[fingerprint])? y
Please type 'yes', 'no' or the fingerprint: y
Please type 'yes', 'no' or the fingerprint:
```

### **Cause:**

First-time SSH connection to GitHub requires explicit confirmation. SSH requires the full word "yes", not just "y".

### **Solution:**

```bash
# Type the complete word
yes
```

**Key Learning:** SSH security prompts require full word responses, not abbreviations.

**Result:** ✅ GitHub host key added to known_hosts

---

## **Error 3: GitHub SSH Permission Denied**

### **Problem:**

```bash
[ec2-user@ip-10-0-2-215 ~]$ git clone git@github.com:Godwin-svg/contact-form-app.git
Cloning into 'contact-form-app'...
git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.

Please make sure you have the correct access rights
and the repository exists.
```

### **Cause:**

EC2 instance doesn't have SSH keys configured for GitHub authentication.

### **Solution:**

Use HTTPS instead of SSH for cloning:

```bash
# Clone using HTTPS (no SSH keys needed)
git clone https://github.com/Godwin-svg/contact-form-app.git
```

**Alternative Solution (if you prefer SSH):**

```bash
# Generate SSH key on EC2
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub: Settings → SSH and GPG keys → New SSH key
```

**Result:** ✅ Repository cloned successfully using HTTPS

---

## **Error 4: IAM Permission Denied - ssm:GetParameters**

### **Problem:**

```bash
> contact-form-aws-rds@1.0.0 start
> node server.js

Failed to start server: User: arn:aws:sts::058264237826:assumed-role/contact-form-school-role/i-06880b9c8deb2d224 is not authorized to perform: ssm:GetParameters on resource: arn:aws:ssm:us-east-1:058264237826:parameter/contact-form/S3_BUCKET_NAME because no identity-based policy allows the ssm:GetParameters action
```

### **Cause:**

The IAM role `contact-form-school-role` attached to the EC2 instance did not have permissions to:

- Read from Parameter Store (`ssm:GetParameters`)
- Read from Secrets Manager (`secretsmanager:GetSecretValue`)
- Upload to S3 (`s3:PutObject`)

### **Root Cause Analysis:**

```
EC2 Instance (i-06880b9c8deb2d224)
    ↓ assumes
IAM Role (contact-form-school-role)
    ↓ has NO policies attached (or insufficient policies)
    ↓ attempts to call
Parameter Store API
    ↓ IAM checks permissions
    ❌ DENY (no matching ALLOW statement found)
```

### **Solution:**

1. **Go to AWS IAM Console** → **Roles** → Search for `contact-form-school-role`

2. **Add inline policy** with the following JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VisualEditor0",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::my-contact-form-uploads-bucket/*"
    },
    {
      "Sid": "VisualEditor1",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "ssm:GetParameters",
        "ssm:GetParameter"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:058264237826:secret:contact-form-secret1-HUOxen",
        "arn:aws:ssm:us-east-1:058264237826:parameter/contact-form/*"
      ]
    }
  ]
}
```

**⚠️ Important:** Fix the common typo - use single slash in parameter path:

- ❌ Wrong: `parameter//contact-form/*` (double slash)
- ✅ Correct: `parameter/contact-form/*` (single slash)

3. **Name the policy:** `contact-form-permissions`

4. **Save and test:**

```bash
# On EC2, restart the application
npm start

# Should see:
# Server running on http://localhost:3000
```

### **Verification:**

```bash
# Test health check
curl http://localhost:3000/api/health

# Expected response:
{"ok":true,"message":"Service is healthy"}
```

**Result:** ✅ Application started successfully with database connectivity

---

## **Warning: Node.js Deprecation (Not Critical)**

### **Warning Message:**

```bash
(node:33718) Warning: NodeDeprecationWarning: The AWS SDK for JavaScript (v3) will
no longer support Node.js v18.20.8 in January 2026.

To continue receiving updates to AWS services, bug fixes, and security
updates please upgrade to a supported Node.js LTS version.
```

### **Status:**

⚠️ **This is a warning, not an error.** The application runs fine with Node.js v18.20.8.

### **Explanation:**

- AWS SDK v3 will drop support for Node.js v18 in January 2026
- Current date: February 2026
- Your app still works, but future AWS SDK updates won't support this Node.js version

### **Future Action (Not Urgent):**

```bash
# When ready to upgrade, install Node.js 20 or 22 LTS
nvm install 20
nvm use 20
nvm alias default 20
```

**Result:** ⏳ Note for future upgrade, not blocking deployment

---

## **Security Best Practices Applied**

### **1. IAM Least Privilege**

✅ Only granted specific permissions:

- `ssm:GetParameters` - Read configuration only
- `secretsmanager:GetSecretValue` - Read secrets only
- `s3:PutObject` - Upload files only (no delete/list)

✅ Scoped to specific resources:

- `/contact-form/*` parameters only
- Specific secret ARN only
- Specific S3 bucket only

### **2. No Hardcoded Credentials**

✅ All secrets stored in AWS Secrets Manager
✅ Configuration in Parameter Store
✅ No `.env` files on server
✅ IAM role provides temporary credentials automatically

### **3. Separation of Concerns**

✅ Infrastructure (IAM) separate from application code
✅ Can update permissions without touching code
✅ Same code works across environments with different roles

---

## **Key Learnings**

### **1. AWS IAM Authorization Flow**

```
Request → IAM Policy Evaluation → Default DENY unless explicit ALLOW
```

### **2. EC2 Instance Profile**

- EC2 uses IAM roles via Instance Profiles
- Provides temporary credentials via STS
- No need for access keys in code

### **3. Git Authentication Methods**

- **SSH:** Requires key setup, more secure for frequent use
- **HTTPS:** Simpler for one-time clone, requires token for private repos

### **4. Amazon Linux Package Management**

- **AL2023:** Use `dnf` (not `yum`)
- **AL2:** Use `yum`

---

## **Deployment Checklist (What Worked)**

✅ **Step 1:** Install git on EC2

```bash
sudo dnf install git -y
```

✅ **Step 2:** Clone repository via HTTPS

```bash
git clone https://github.com/Godwin-svg/contact-form-app.git
cd contact-form-app
```

✅ **Step 3:** Install Node.js

```bash
sudo dnf install nodejs -y
```

✅ **Step 4:** Install dependencies

```bash
npm install
```

✅ **Step 5:** Configure IAM permissions

- Add policy to `contact-form-school-role`
- Include `ssm:GetParameters`, `secretsmanager:GetSecretValue`, `s3:PutObject`

✅ **Step 6:** Start application

```bash
npm start
```

✅ **Step 7:** Verify health check

```bash
curl http://localhost:3000/api/health
```

---

## **Next Steps (Recommended)**

⏳ **Keep application running with PM2** (so it doesn't stop when you close SSH)

```bash
npm install -g pm2
pm2 start server.js --name contact-form
pm2 save
pm2 startup
```

⏳ **Deploy frontend to Amplify**

- Connect GitHub repo to Amplify Console
- Auto-detect `amplify.yml` configuration
- Deploy `public/` folder as static site

⏳ **Verify ALB health checks**

- Check Target Group shows "healthy" status
- Test ALB endpoint: `curl http://contact-form-alb-1982529542.us-east-1.elb.amazonaws.com/api/health`

⏳ **Test end-to-end**

- Open Amplify URL in browser
- Submit contact form with attachment
- Verify saves to RDS and uploads to S3

---

## **Quick Reference - Common Commands**

### **Check Application Status**

```bash
# If running with npm start
ps aux | grep node

# If running with PM2
pm2 status
pm2 logs contact-form
```

### **Restart Application**

```bash
# With PM2
pm2 restart contact-form

# Without PM2
# Press Ctrl+C, then npm start
```

### **Pull Updates from GitHub**

```bash
cd contact-form-app
git pull
npm install
pm2 restart contact-form
```

### **Check IAM Permissions (on EC2)**

```bash
# Test Parameter Store access
aws ssm get-parameters --names /contact-form/S3_BUCKET_NAME --region us-east-1

# Test Secrets Manager access
aws secretsmanager get-secret-value --secret-id contact-form-secret1 --region us-east-1
```

### **View Application Logs**

```bash
# With PM2
pm2 logs contact-form --lines 100

# Without PM2 (if running in foreground)
# Logs appear directly in terminal
```

---

## **Contact & Support**

If you encounter new errors:

1. **Check CloudWatch Logs** (if configured)
2. **Check PM2 logs:** `pm2 logs contact-form`
3. **Check IAM permissions** in AWS Console
4. **Verify AWS resources exist:**
   - Parameter Store parameters
   - Secrets Manager secret
   - RDS database (status: Available)
   - S3 bucket
   - Security Groups allow traffic

---

**Last Updated:** February 21, 2026  
**Status:** Backend deployed successfully ✅  
**Next Step:** Deploy frontend to Amplify
