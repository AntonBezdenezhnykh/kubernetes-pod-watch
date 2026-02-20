# Kubernetes Pod Watch - Kubernetes Deployment

This directory contains all the Kubernetes manifests to deploy the Kubernetes Pod Watch application.

## Architecture

The deployment consists of:
- **Frontend**: React application served by Nginx
- **Backend**: Node.js API server for database operations
- **Database**: PostgreSQL with persistent storage
- **Data Collector**: CronJob that collects Kubernetes data every 2 minutes

## Files

- `namespace.yaml` - Creates the kubernetes-pod-watch namespace
- `configmap.yaml` - Application configuration
- `secret.yaml` - Database credentials (change for production)
- `postgres.yaml` - PostgreSQL StatefulSet and Service
- `postgres-init-configmap.yaml` - Database initialization scripts
- `backend.yaml` - Backend API server
- `frontend.yaml` - Frontend web application
- `data-collection.yaml` - CronJob for data collection
- `rbac.yaml` - Service account and permissions for data collection

## Deployment Steps

### 1. Build and Push Docker Image

```bash
# Build the frontend image
docker build -t kubernetes-pod-watch:latest .

# If using a local registry (like minikube)
eval $(minikube docker-env)
docker build -t kubernetes-pod-watch:latest .

# Or push to your registry
docker tag kubernetes-pod-watch:latest your-registry/kubernetes-pod-watch:latest
docker push your-registry/kubernetes-pod-watch:latest
```

### 2. Deploy the Application

```bash
# Apply all manifests
kubectl apply -f k8s/

# Or apply in order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres-init-configmap.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/data-collection.yaml
```

### 3. Wait for Pods to be Ready

```bash
# Check pod status
kubectl get pods -n kubernetes-pod-watch

# Wait for all pods to be running
kubectl wait --for=condition=ready pod -l app=frontend -n kubernetes-pod-watch --timeout=300s
kubectl wait --for=condition=ready pod -l app=backend -n kubernetes-pod-watch --timeout=300s
kubectl wait --for=condition=ready pod -l app=postgres -n kubernetes-pod-watch --timeout=300s
```

### 4. Access the Application

```bash
# Get the frontend service URL
kubectl get service frontend-service -n kubernetes-pod-watch

# If using LoadBalancer (cloud provider)
EXTERNAL_IP=$(kubectl get service frontend-service -n kubernetes-pod-watch -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Access the app at: http://$EXTERNAL_IP"

# If using minikube
minikube service frontend-service -n kubernetes-pod-watch

# If using port forwarding
kubectl port-forward service/frontend-service 8080:80 -n kubernetes-pod-watch
echo "Access the app at: http://localhost:8080"
```

### 5. Verify Data Collection

```bash
# Check if data collection job is running
kubectl get cronjobs -n kubernetes-pod-watch

# Manually trigger a data collection job
kubectl create job --from=cronjob/kubernetes-data-collector manual-data-collection -n kubernetes-pod-watch

# Check job logs
kubectl logs job/manual-data-collection -n kubernetes-pod-watch
```

## Configuration

### Database Credentials

Update the `secret.yaml` file with your actual database credentials:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: pod-watch-secrets
  namespace: kubernetes-pod-watch
type: Opaque
data:
  DB_PASSWORD: <base64-encoded-password>
  DATABASE_URL: <base64-encoded-database-url>
```

### Environment Variables

The `configmap.yaml` contains environment variables that can be customized:

- `VITE_SUPABASE_URL` - Backend API URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Frontend API key
- `DB_HOST` - Database hostname
- `DB_PORT` - Database port
- `DB_NAME` - Database name
- `DB_USER` - Database username

## Monitoring

### Check Application Status

```bash
# Check all resources
kubectl get all -n kubernetes-pod-watch

# Check pod logs
kubectl logs -l app=frontend -n kubernetes-pod-watch
kubectl logs -l app=backend -n kubernetes-pod-watch
kubectl logs -l app=postgres -n kubernetes-pod-watch

# Check database connection
kubectl exec -it deployment/postgres -n kubernetes-pod-watch -- psql -U postgres -d kubernetes_monitor -c "SELECT COUNT(*) FROM pods;"
```

### Scale the Application

```bash
# Scale frontend
kubectl scale deployment frontend --replicas=3 -n kubernetes-pod-watch

# Scale backend
kubectl scale deployment backend --replicas=2 -n kubernetes-pod-watch
```

## Cleanup

```bash
# Delete all resources
kubectl delete namespace kubernetes-pod-watch

# Or delete individual resources
kubectl delete -f k8s/
```

## Troubleshooting

### Frontend Not Loading

1. Check if the frontend pod is running: `kubectl get pods -l app=frontend -n kubernetes-pod-watch`
2. Check frontend logs: `kubectl logs -l app=frontend -n kubernetes-pod-watch`
3. Verify the service is accessible: `kubectl get service frontend-service -n kubernetes-pod-watch`

### Backend API Not Working

1. Check backend pod status: `kubectl get pods -l app=backend -n kubernetes-pod-watch`
2. Check backend logs: `kubectl logs -l app=backend -n kubernetes-pod-watch`
3. Test API endpoint: `kubectl port-forward service/backend-service 54321:54321 -n kubernetes-pod-watch`

### Database Connection Issues

1. Check PostgreSQL pod: `kubectl get pods -l app=postgres -n kubernetes-pod-watch`
2. Check database logs: `kubectl logs -l app=postgres -n kubernetes-pod-watch`
3. Test database connection: `kubectl exec -it deployment/postgres -n kubernetes-pod-watch -- psql -U postgres -d kubernetes_monitor`

### Data Collection Not Working

1. Check CronJob status: `kubectl get cronjobs -n kubernetes-pod-watch`
2. Check job history: `kubectl get jobs -n kubernetes-pod-watch`
3. Check job logs: `kubectl logs job/<job-name> -n kubernetes-pod-watch`
4. Verify RBAC permissions: `kubectl auth can-i get pods --as=system:serviceaccount:kubernetes-pod-watch:pod-monitor`
