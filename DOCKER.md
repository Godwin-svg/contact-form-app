# Docker Deployment Guide

This guide explains how to build and run your contact form application using Docker.

---

## **Files Created**

1. **Dockerfile** - Multi-stage build configuration for production
2. **.dockerignore** - Excludes unnecessary files from Docker build
3. **docker-compose.yml** - Orchestration for easier container management

---

## **Building the Docker Image**

### **Option 1: Using Docker CLI**

```bash
# Build the image
docker build -t contact-form-app:latest .

# View the built image
docker images | grep contact-form
```

### **Option 2: Using Docker Compose**

```bash
# Build the image
docker-compose build

# View the built image
docker-compose images
```

---

## **Running the Container**

### **Option 1: Using Docker CLI**

```bash
# Run the container
docker run -d \
  --name contact-form \
  -p 3000:3000 \
  --restart unless-stopped \
  contact-form-app:latest

# View running container
docker ps

# View logs
docker logs contact-form

# Follow logs (real-time)
docker logs -f contact-form
```

### **Option 2: Using Docker Compose (Recommended)**

```bash
# Start the application
docker-compose up -d

# View status
docker-compose ps

# View logs
docker-compose logs

# Follow logs (real-time)
docker-compose logs -f

# Stop the application
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

---

## **Dockerfile Explanation**

### **Multi-Stage Build**

The Dockerfile uses a **two-stage build** to create a smaller production image:

```dockerfile
# Stage 1: Builder (installs dependencies)
FROM node:18-alpine AS builder
- Installs all dependencies including devDependencies
- Creates node_modules folder

# Stage 2: Production (copies only what's needed)
FROM node:18-alpine
- Copies node_modules from builder stage
- Results in smaller final image (~200MB vs ~400MB)
```

### **Security Features**

1. **Non-root user**:

   ```dockerfile
   RUN adduser -S nodejs -u 1001
   USER nodejs
   ```

   - App runs as `nodejs` user (not root) for security
   - UID 1001 for consistent permissions

2. **dumb-init**:

   ```dockerfile
   ENTRYPOINT ["dumb-init", "--"]
   ```

   - Handles signals properly (SIGTERM, SIGINT)
   - Ensures graceful shutdown
   - Prevents zombie processes

3. **Health check**:
   ```dockerfile
   HEALTHCHECK --interval=30s --timeout=3s
   ```

   - Docker monitors app health automatically
   - Calls `/api/health` endpoint every 30 seconds
   - Marks container unhealthy if check fails

### **Why Alpine Linux?**

```dockerfile
FROM node:18-alpine
```

- **Small size**: ~40MB base vs ~200MB for standard Node.js image
- **Security**: Fewer packages = smaller attack surface
- **Fast**: Faster builds and deployments
- **Production-ready**: Widely used in production

---

## **Container Management Commands**

### **Viewing Container Info**

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# View container details
docker inspect contact-form

# View container stats (CPU, memory)
docker stats contact-form

# Check container health
docker inspect --format='{{.State.Health.Status}}' contact-form
```

### **Managing Containers**

```bash
# Stop container
docker stop contact-form

# Start stopped container
docker start contact-form

# Restart container
docker restart contact-form

# Remove container (must stop first)
docker stop contact-form && docker rm contact-form

# Force remove running container
docker rm -f contact-form
```

### **Viewing Logs**

```bash
# View all logs
docker logs contact-form

# View last 50 lines
docker logs --tail 50 contact-form

# Follow logs (real-time)
docker logs -f contact-form

# View logs with timestamps
docker logs -t contact-form
```

### **Executing Commands in Container**

```bash
# Open shell in running container
docker exec -it contact-form sh

# Run single command
docker exec contact-form node -v

# View environment variables
docker exec contact-form env
```

---

## **Deploying to EC2 with Docker**

### **Prerequisites**

1. Docker installed on EC2 (see Docker setup commands)
2. IAM role attached to EC2 with required permissions
3. AWS Parameter Store and Secrets Manager configured

### **Deployment Steps**

```bash
# 1. SSH to EC2
ssh ec2-user@your-ec2-ip

# 2. Install Docker (if not already installed)
sudo dnf install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user
newgrp docker

# 3. Clone your repository
git clone https://github.com/Godwin-svg/contact-form-app.git
cd contact-form-app

# 4. Build the image
docker build -t contact-form-app:latest .

# 5. Run the container
docker run -d \
  --name contact-form \
  -p 3000:3000 \
  --restart unless-stopped \
  contact-form-app:latest

# 6. Verify it's running
docker ps
curl http://localhost:3000/api/health

# 7. Check logs
docker logs -f contact-form
```

### **Using Docker Compose on EC2**

```bash
# After cloning repository
cd contact-form-app

# Install Docker Compose (if not already installed)
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Start application
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

---

## **Docker vs PM2: Which to Use?**

### **PM2 (Current Setup)**

**Pros:**
✅ Simpler for Node.js applications
✅ Built-in process monitoring
✅ Zero-downtime reload
✅ Automatic restart on crash

**Cons:**
❌ Not isolated (uses host OS directly)
❌ Harder to replicate exact environment
❌ Manual dependency management

### **Docker**

**Pros:**
✅ Complete isolation (container = own environment)
✅ Reproducible builds ("works on my machine" solved)
✅ Easy to scale (run multiple containers)
✅ Portable (same image works anywhere)
✅ Better resource limits (CPU, memory)

**Cons:**
❌ More complex setup
❌ Requires Docker knowledge
❌ Slightly more overhead (minimal with Alpine)

### **Recommendation**

**For your current setup:** Stick with PM2

- Single EC2 instance
- Simple deployment
- Working well already

**Switch to Docker when:**

- You need to deploy to ECS/EKS
- You have multiple microservices
- You want container orchestration
- You need guaranteed environment consistency

---

## **Updating Application with Docker**

```bash
# 1. SSH to EC2
ssh ec2-user@your-ec2-ip

# 2. Pull latest code
cd contact-form-app
git pull origin main

# 3. Rebuild image
docker build -t contact-form-app:latest .

# 4. Stop old container
docker stop contact-form
docker rm contact-form

# 5. Start new container
docker run -d \
  --name contact-form \
  -p 3000:3000 \
  --restart unless-stopped \
  contact-form-app:latest

# OR with Docker Compose (zero-downtime)
docker-compose up -d --build
```

---

## **Troubleshooting**

### **Container Won't Start**

```bash
# Check logs
docker logs contact-form

# Common issues:
# - IAM permissions missing
# - Parameter Store values incorrect
# - Port 3000 already in use
# - Database connection failed
```

### **Port Already in Use**

```bash
# Find what's using port 3000
sudo lsof -i :3000

# If PM2 is running, stop it first
pm2 stop contact-form
# OR kill the process
sudo kill -9 <PID>
```

### **Image Build Fails**

```bash
# Clean build cache
docker system prune -a

# Rebuild without cache
docker build --no-cache -t contact-form-app:latest .
```

### **Container Is Unhealthy**

```bash
# Check health status
docker inspect --format='{{json .State.Health}}' contact-form | jq

# Test health endpoint manually
docker exec contact-form wget -O- http://localhost:3000/api/health
```

---

## **Best Practices**

1. **Tag your images** with version numbers:

   ```bash
   docker build -t contact-form-app:1.0.0 .
   docker build -t contact-form-app:latest .
   ```

2. **Use `.dockerignore`** to exclude unnecessary files (already created)

3. **Set resource limits** to prevent container from consuming all resources:

   ```bash
   docker run -d \
     --name contact-form \
     --memory="512m" \
     --cpus="1.0" \
     -p 3000:3000 \
     contact-form-app:latest
   ```

4. **Monitor container health**:

   ```bash
   # Set up health check monitoring
   docker events --filter 'event=health_status'
   ```

5. **Regular cleanup**:

   ```bash
   # Remove unused images
   docker image prune -a

   # Remove stopped containers
   docker container prune

   # Remove everything unused
   docker system prune -a
   ```

---

## **Next Steps**

If you want to use Docker in production:

1. **Test locally** on your laptop first
2. **Push image to ECR** (Elastic Container Registry)
3. **Deploy to ECS** or **EKS** for auto-scaling
4. **Set up CI/CD** to auto-build on git push

For now, **PM2 is perfect for your use case**. Docker is here when you need it! 🐳
