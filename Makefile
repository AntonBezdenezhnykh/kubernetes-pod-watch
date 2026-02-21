SHELL := /bin/bash

ENV_FILE ?= k8s/production/.env.production
TEMPLATE_FILE ?= k8s/production/deploy.template.yaml
RENDERED_FILE ?= k8s/production/deploy.rendered.yaml

REQUIRED_VARS := APP_NAMESPACE APP_NAME APP_VERSION APP_IMAGE APP_REPLICAS CONTAINER_PORT SERVICE_PORT SERVICE_TYPE COLLECT_SCHEDULE LOG_TAIL_LINES SAMPLE_INTERVAL_SECONDS TARGET_NAMESPACE DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD DB_SSL

.PHONY: prod-render prod-apply prod-validate

prod-validate:
	command -v envsubst >/dev/null || { echo "Error: envsubst is required"; exit 1; }
	test -f "$(ENV_FILE)" || { echo "Error: env file not found: $(ENV_FILE)"; exit 1; }
	test -f "$(TEMPLATE_FILE)" || { echo "Error: template not found: $(TEMPLATE_FILE)"; exit 1; }
	set -a; source "$(ENV_FILE)"; set +a; \
	for var in $(REQUIRED_VARS); do \
	  if [[ -z "$${!var}" ]]; then \
	    echo "Error: required variable '$$var' is missing in $(ENV_FILE)"; \
	    exit 1; \
	  fi; \
	done

prod-render: prod-validate
	set -a; source "$(ENV_FILE)"; set +a; envsubst < "$(TEMPLATE_FILE)" > "$(RENDERED_FILE)"
	@echo "Rendered: $(RENDERED_FILE)"

prod-apply: prod-render
	command -v kubectl >/dev/null || { echo "Error: kubectl is required"; exit 1; }
	kubectl apply --dry-run=client -f "$(RENDERED_FILE)"
	kubectl apply -f "$(RENDERED_FILE)"
	@echo "Applied: $(RENDERED_FILE)"
