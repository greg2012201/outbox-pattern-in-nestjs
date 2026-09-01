#!/bin/sh

set -e

YELLOW='\033[1;33m'
GREEN='\033[1;32m'
RED='\033[1;31m'
CYAN='\033[1;36m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BUILDER="tsc"
MODE="watch"

for arg in "$@"; do
  case "$arg" in
  --swc) BUILDER="swc" ;;
  esac
done

log_info() {
  printf "${CYAN}[INFO]${NC} %s\n" "$1"
}

log_success() {
  printf "${GREEN}[OK]${NC} %s\n" "$1"
}

log_warn() {
  printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

log_error() {
  printf "${RED}[ERROR]${NC} %s\n" "$1"
}

cleanup() {
  trap - EXIT INT TERM
  log_info "Shutting down all services..."
  kill 0 2>/dev/null
  wait 2>/dev/null
  log_info "All services stopped."
}

trap cleanup EXIT INT TERM

wait_for_port() {
  local host="$1"
  local port="$2"
  local name="$3"
  local retries=30
  local count=0

  while ! nc -z "$host" "$port" >/dev/null 2>&1; do
    count=$((count + 1))
    if [ "$count" -ge "$retries" ]; then
      log_error "$name on $host:$port did not become ready in time"
      return 1
    fi
    sleep 1
  done

  log_success "$name is ready on port $port"
}

log_info "Starting Payment Service Outbox Pattern - Full Monorepo"
log_info "======================================================="
log_info "Builder: $BUILDER"

log_info "Stopping any existing Docker containers..."
  docker compose -f "$ROOT_DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true

log_info "Removing stale containers if any..."
for container in order-db payment-db notification-db email-db rabbitmq; do
  docker rm -f "$container" 2>/dev/null || true
done

log_info "Checking for port conflicts..."
REQUIRED_PORTS="25432 25433 25434 25435 5672 15672 3000 3001"
for port in $REQUIRED_PORTS; do
  container_id=$(docker ps -q --filter "publish=$port" 2>/dev/null || true)
  if [ -n "$container_id" ]; then
    log_warn "Docker container using port $port, stopping it..."
    docker rm -f $container_id 2>/dev/null || true
  fi

  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    log_warn "Port $port is in use by PID(s) $pids, killing..."
    kill -9 $pids 2>/dev/null || true
  fi
done

for port in $REQUIRED_PORTS; do
  retries=10
  count=0
  while lsof -ti :"$port" >/dev/null 2>&1; do
    count=$((count + 1))
    if [ "$count" -ge "$retries" ]; then
      log_error "Port $port is still in use after waiting, aborting."
      exit 1
    fi
    sleep 1
  done
done

log_info "Starting Docker infrastructure..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d --remove-orphans

log_info "Waiting for infrastructure to be ready..."

wait_for_port localhost 25432 "PostgreSQL (order-db)"
wait_for_port localhost 25433 "PostgreSQL (payment-db)"
wait_for_port localhost 25434 "PostgreSQL (notification-db)"
wait_for_port localhost 25435 "PostgreSQL (email-db)"
wait_for_port localhost 5672 "RabbitMQ (port)"

log_info "Waiting for RabbitMQ broker to be fully ready..."
rabbitmq_retries=30
rabbitmq_count=0
while ! docker exec rabbitmq rabbitmq-diagnostics -q check_port_connectivity >/dev/null 2>&1; do
  rabbitmq_count=$((rabbitmq_count + 1))
  if [ "$rabbitmq_count" -ge "$rabbitmq_retries" ]; then
    log_error "RabbitMQ broker did not become ready in time"
    exit 1
  fi
  sleep 1
done
log_success "RabbitMQ broker is fully ready"

log_success "All infrastructure services are ready"

log_info "Starting NestJS services in $MODE mode ($BUILDER)..."

npx nest start api-gateway --watch --builder "$BUILDER" 2>&1 | sed --unbuffered "s/^/[api-gateway] /" &
npx nest start order-service --watch --builder "$BUILDER" 2>&1 | sed --unbuffered "s/^/[order-service] /" &
npx nest start payment-service --watch --builder "$BUILDER" 2>&1 | sed --unbuffered "s/^/[payment-service] /" &
npx nest start notification-service --watch --builder "$BUILDER" 2>&1 | sed --unbuffered "s/^/[notification-service] /" &
npx nest start email-service --watch --builder "$BUILDER" 2>&1 | sed --unbuffered "s/^/[email-service] /" &

log_success "All services started"
printf "\n"
log_info "Services:"
log_info "  API Gateway:          http://localhost:3000"
log_info "  Order Service:        http://localhost:3001"
log_info "  Payment Service:      RabbitMQ consumer (payment_service_queue)"
log_info "  Notification Service: RabbitMQ consumer (notification_service_queue)"
log_info "  Email Service:        RabbitMQ consumer (email_service_queue)"
printf "\n"
log_info "Infrastructure:"
log_info "  RabbitMQ Management:  http://localhost:15672 (guest/guest)"
log_info "  PostgreSQL (order):   localhost:25432"
log_info "  PostgreSQL (payment): localhost:25433"
log_info "  PostgreSQL (notif):   localhost:25434"
log_info "  PostgreSQL (email):   localhost:25435"
printf "\n"
log_info "Press Ctrl+C to stop all services"

wait
