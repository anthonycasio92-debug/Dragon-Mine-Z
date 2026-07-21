function damagedEntity(event) {
    var item = event.player.getMainhandItem();
    if (item == null || item.isEmpty()) return;

    var attack = item.getAttackDamage();
    var fire = 0;
    var cold = 0;

    if (item.hasAttribute("attributeslib:fire_damage")) {
        fire += item.getAttribute("attributeslib:fire_damage");
    }
    if (item.hasAttribute("apothic_attributes:fire_damage")) {
        fire += item.getAttribute("apothic_attributes:fire_damage");
    }

    if (item.hasAttribute("attributeslib:cold_damage")) {
        cold += item.getAttribute("attributeslib:cold_damage");
    }
    if (item.hasAttribute("apothic_attributes:cold_damage")) {
        cold += item.getAttribute("apothic_attributes:cold_damage");
    }

    var total = attack + fire + cold;
    if (total <= 0) return;

    event.damage = event.damage * (1 + (total * 0.01));
}
