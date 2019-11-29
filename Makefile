.SILENT:
.PHONY: all

start:
	docker-compose up -d nginx;

watch:
	docker-compose run --rm -T -u $$(id -u) node node watch.js;
