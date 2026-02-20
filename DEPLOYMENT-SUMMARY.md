# Kubernetes Pod Watch - Deployment Summary

## ✅ Deployment Complete

The Kubernetes Pod Watch application has been successfully deployed to your local Kubernetes cluster!

## 🏗️ Architecture Deployed

### Components
- **Frontend**: React application served by Nginx (2 replicas)
- **Backend**: Node.js API server with PostgreSQL connectivity (1 replica)
- **Database**: External PostgreSQL on localhost:5432
- **Data Collection**: Sample data populated in database

### Access Information
- **Frontend URL**: http://192.168.139.2:80
- **Backend API**: Internal service at `backend-service:54321`
- **Database**: PostgreSQL on localhost:5432 (kubernetes_monitor database)

## 📊 Current Data

The database has been populated with sample data:
- **3 Pods**: sample-app-1 (Running), sample-app-2 (Running), error-pod-1 (Error)
- **1 Container**: main-container (Running) with sample logs
- **3 Log Entries**: info and warn level messages

## 🚀 Quick Start

1. **Access the Application**:
   ```bash
   # Open in browser
   open http://192.168.139.2:80
   ```

2. **Check Pod Status**:
   ```bash
   kubectl get pods -n kubernetes-pod-watch
   ```

3. **View Services**:
   ```bash
   kubectl get services -n kubernetes-pod-watch
   ```

4. **Check Database**:
   ```bash
   psql -U postgres -d kubernetes_monitor -c "SELECT name, namespace, status FROM pods;"
   ```

## 📁 Files Created

### Docker Images
- `Dockerfile` - Frontend React application
- `k8s/backend-dockerfile` - Backend API server
- `k8s/server.js` - Backend Node.js application

### Kubernetes Manifests
- `k8s/deploy-without-postgres.yaml` - Complete deployment manifest
- `k8s/backend-final.yaml` - Backend deployment
- `k8s/frontend-fixed.yaml` - Frontend deployment
- `k8s/data-collector-fixed.yaml` - Data collection job

### Database
- `k8s/init-db.sql` - Database schema initialization
- `k8s/README-external-db.md` - External database setup guide

## 🔧 Configuration

### Database Connection
- **Host**: host.docker.internal
- **Port**: 5432
- **Database**: kubernetes_monitor
- **User**: postgres
- **Password**: (empty)

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `VITE_SUPABASE_URL`: Backend API URL
- `API_PORT`: Backend server port (54321)

## 🛠️ Management Commands

### Scale Applications
```bash
# Scale frontend
kubectl scale deployment frontend --replicas=3 -n kubernetes-pod-watch

# Scale backend
kubectl scale deployment backend --replicas=2 -n kubernetes-pod-watch
```

### View Logs
```bash
# Frontend logs
kubectl logs -l app=frontend -n kubernetes-pod-watch

# Backend logs
kubectl logs -l app=backend -n kubernetes-pod-watch
```

### Update Data
```bash
# Run data collection manually
kubectl create job --from=cronjob/kubernetes-data-collector manual-sync -n kubernetes-pod-watch
```

### Cleanup
```bash
# Delete everything
kubectl delete namespace kubernetes-pod-watch

# Or delete specific resources
kubectl delete -f k8s/deploy-without-postgres.yaml
```

## 🎯 Next Steps

1. **Explore the Dashboard**: Visit http://192.168.139.2:80 to see the monitoring interface
2. **Add More Data**: Use the data collection job to sync real Kubernetes data
3. **Customize Configuration**: Modify ConfigMaps and Secrets as needed
4. **Monitor Performance**: Check pod resource usage and scale as needed

## 🔍 Troubleshooting

### Frontend Not Accessible
```bash
kubectl get service frontend-service -n kubernetes-pod-watch
kubectl describe service frontend-service -n kubernetes-pod-watch
```

### Backend Issues
```bash
kubectl logs -l app=backend -n kubernetes-pod-watch
kubectl exec -it deployment/backend -n kubernetes-pod-watch -- node -e "console.log('Backend is running')"
```

### Database Connection
```bash
# Test connection from container
kubectl run test-db --image=postgres:15-alpine --rm -it --restart=Never -n kubernetes-pod-watch -- psql "postgresql://postgres@host.docker.internal:5432/kubernetes_monitor?sslmode=disable" -c "SELECT 1;"
```

## 📈 Monitoring

The application is now ready for monitoring your Kubernetes cluster! The dashboard will show:
- Pod status overview
- Container details
- Real-time log streaming
- Namespace filtering
- Search functionality

All components are running and the database contains sample data for testing. Enjoy your Kubernetes monitoring dashboard! 🎉
