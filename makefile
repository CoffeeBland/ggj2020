NPROCS = $(shell grep -c 'processor' /proc/cpuinfo)
MAKEFLAGS += -j$(NPROCS)

#!make
include .env
include settings

peeps = $(wildcard client/assets/peeps/*.png)

define GEN_RULE_PEEP
imgs = $(imgs) $(subst .png,-$(part)-$(width).png, $(subst peeps/,parts/, $(peeps)))
client/assets/parts/%-$(part)-$(width).png: client/assets/peeps/%.png
	@mkdir -p client/assets/parts
	convert -crop 3240x$($(part)_height)+0+$($(part)_start) -scale $(width) $$< $$@
endef

$(foreach part,$(PARTS), \
	$(foreach width,$(WIDTHS), \
		$(eval $(GEN_RULE_PEEP))))

img: $(imgs)

clean:
	@echo "Removing parts folders"
	@rm -rf client/assets/parts
