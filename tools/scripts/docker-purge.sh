#!/bin/sh

YELLOW='\033[1;33m'
GREEN='\033[1;32m'
RED='\033[1;31m'
CYAN='\033[1;36m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

log_info() {
  printf "${CYAN}[INFO]${NC} %s\n" "$1"
}

log_success() {
  printf "${GREEN}[OK]${NC} %s\n" "$1"
}

log_warn() {
  printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

log_info "Purging all Docker resources for the project..."

log_info "Stopping and removing containers, networks, and volumes..."
docker compose -f "$ROOT_DIR/docker-compose.yml" down --volumes --remove-orphans 2>/dev/null || true

log_info "Force-removing project containers..."
for container in order-db payment-db notification-db email-db rabbitmq; do
  docker rm -f "$container" 2>/dev/null || true
done

log_info "Removing project volumes..."
for volume in payment-service-outbox-pattern_order_db_data payment-service-outbox-pattern_payment_db_data payment-service-outbox-pattern_notification_db_data payment-service-outbox-pattern_email_db_data payment-service-outbox-pattern_rabbitmq_data; do
  docker volume rm -f "$volume" 2>/dev/null || true
done

log_info "Removing project network..."
docker network rm payment-service-outbox-pattern_payment-network 2>/dev/null || true

log_info "Freeing up ports..."
REQUIRED_PORTS="25432 25433 25434 25435 5672 15672"
for port in $REQUIRED_PORTS; do
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    log_warn "Port $port is in use by PID $pid, killing it..."
    kill -9 $pid 2>/dev/null || true
  fi
done

log_success "All project Docker resources have been purged."
