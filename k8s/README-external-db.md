# Kubernetes Pod Watch - Deployment with External PostgreSQL

This deployment uses your external PostgreSQL database running on localhost:5432 with user `postgres` and empty password.

## Prerequisites

1. **Kubernetes cluster** (local like minikube, Docker Desktop, or any cloud provider)
2. **External PostgreSQL** running on localhost:5432
3. **Docker** installed and running

## Step 1: Initialize Database

First, create the database schema on your local PostgreSQL:

```bash
# Connect to PostgreSQL and run the initialization script
psql -U postgres -f k8s/init-db.sql
```

Or run the commands manually:

```bash
# Create database
createdb -U postgres kubernetes_monitor

# Connect and create schema
psql -U postgres -d kubernetes_monitor
# Then copy-paste the contents of k8s/init-db.sql
```

## Step 2: Build Docker Image

```bash
# Build the frontend image
docker build -t kubernetes-pod-watch:latest .

# If using minikube, load the image into the cluster
minikube image load kubernetes-pod-watch:latest

# If using Docker Desktop Kubernetes, the image should be available automatically
```

## Step 3: Deploy to Kubernetes

```bash
# Deploy all components at once
kubectl apply -f k8s/deploy-without-postgres.yaml

# Or verify the deployment
kubectl get all -n kubernetes-pod-watch
```

## Step 4: Wait for Pods to be Ready

```bash
# Check pod status
kubectl get pods -n kubernetes-pod-watch -w

# Wait for all pods to be running
kubectl wait --for=condition=ready pod -l app=frontend -n kubernetes-pod-watch --timeout=300s
kubectl wait --for=condition=ready pod -l app=backend -n kubernetes-pod-watch --timeout=300s
```

## Step 5: Access the Application

### For minikube:
```bash
minikube service frontend-service -n kubernetes-pod-watch
```

### For Docker Desktop:
```bash
kubectl port-forward service/frontend-service 8080:80 -n kubernetes-pod-watch
# Then open http://localhost:8080
```

### For cloud provider (LoadBalancer):
```bash
EXTERNAL_IP=$(kubectl get service frontend-service -n kubernetes-pod-watch -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Access the app at: http://$EXTERNAL_IP"
```

## Step 6: Run Data Collection

The data collection CronJob will run automatically every 2 minutes. To manually trigger it:

```bash
# Create a manual job
kubectl create job --from=cronjob/kubernetes-data-collector manual-data-collection -n kubernetes-pod-watch

# Check job logs
kubectl logs job/manual-data-collection -n kubernetes-pod-watch -f
```

## Configuration Details

### Database Connection
The application connects to your external PostgreSQL using:
- **Host**: `host.docker.internal` (special DNS name that resolves to the host machine)
- **Port**: `5432`
- **Database**: `kubernetes_monitor`
- **User**: `postgres`
- **Password**: (empty)

### Kubernetes Components Deployed
1. **Namespace**: `kubernetes-pod-watch`
2. **ConfigMap**: Application configuration
3. **Secret**: Database connection string
4. **RBAC**: Service account and permissions for data collection
5. **Backend**: Node.js API server
6. **Frontend**: React web application
7. **Data Collector**: CronJob that collects Kubernetes data every 2 minutes

## Troubleshooting

### Database Connection Issues

1. **Verify PostgreSQL is running on localhost:5432**
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. **Test connection from container**
   ```bash
   # Run a temporary container to test connection
   kubectl run test-db --image=postgres:15-alpine --rm -it --restart=Never -n kubernetes-pod-watch -- psql "postgresql://postgres@host.docker.internal:5432/kubernetes_monitor?sslmode=disable" -c "SELECT 1;"
   ```

3. **Check if database exists**
   ```bash
   psql -U postgres -h localhost -c "\l" | grep kubernetes_monitor
   ```

### Application Issues

1. **Check pod logs**
   ```bash
   kubectl logs -l app=frontend -n kubernetes-pod-watch
   kubectl logs -l app=backend -n kubernetes-pod-watch
   ```

2. **Check services**
   ```bash
   kubectl get services -n kubernetes-pod-watch
   kubectl describe service backend-service -n kubernetes-pod-watch
   kubectl describe service frontend-service -n kubernetes-pod-watch
   ```

3. **Test backend API**
   ```bash
   kubectl port-forward service/backend-service 54321:54321 -n kubernetes-pod-watch
   curl "http://localhost:54321/functions/v1/database?action=health"
   ```

### Data Collection Issues

1. **Check CronJob status**
   ```bash
   kubectl get cronjobs -n kubernetes-pod-watch
   kubectl get jobs -n kubernetes-pod-watch
   ```

2. **Check RBAC permissions**
   ```bash
   kubectl auth can-i get pods --as=system:serviceaccount:kubernetes-pod-watch:pod-monitor
   ```

3. **Manual data collection test**
   ```bash
   kubectl create job --from=cronjob/kubernetes-data-collector test-collection -n kubernetes-pod-watch
   kubectl logs job/test-collection -n kubernetes-pod-watch
   ```

## Cleanup

```bash
# Delete all resources
kubectl delete namespace kubernetes-pod-watch

# Or delete specific resources
kubectl delete -f k8s/deploy-without-postgres.yaml
```

## Important Notes

1. **host.docker.internal**: This special DNS name allows Kubernetes containers to reach services running on the host machine. It works with Docker Desktop and minikube. For other Kubernetes distributions, you may need to use the host's IP address.

2. **Database Security**: The configuration uses an empty password for PostgreSQL. For production, ensure proper security measures are in place.

3. **Network Access**: Ensure your local PostgreSQL accepts connections from Docker containers. You may need to configure `postgresql.conf` and `pg_hba.conf` to allow connections from the Docker network.

4. **Resource Limits**: The deployed components have modest resource limits suitable for development. Adjust as needed for your environment.
