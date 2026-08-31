import { Building2, Layers } from 'lucide-react';

export default function ViewerSidebar({
  buildings,
  floors,
  activeBuildingId,
  activeFloorId,
  onSelectBuilding,
  onSelectFloor,
}) {
  return (
    <aside className="viewerSidebar">
      <div className="panelHeader">
        <Building2 size={18} />
        <h2>Buildings</h2>
      </div>
      {buildings.length === 0 ? (
        <p className="emptyHint">No published buildings are available.</p>
      ) : null}
      <div className="buildingTree">
        {buildings.map((building) => {
          const buildingFloors = floors
            .filter((floor) => Number(floor.buildingId) === Number(building.id))
            .sort((a, b) => Number(a.floorNumber) - Number(b.floorNumber));
          const isActiveBuilding = Number(activeBuildingId) === Number(building.id);

          return (
            <section className="treeBuilding" key={building.id}>
              <button
                className={`treeBuildingButton ${isActiveBuilding ? 'isActive' : ''}`}
                type="button"
                onClick={() => onSelectBuilding(building.id)}
              >
                <span
                  className="buildingColor"
                  style={{ backgroundColor: building.color || '#176b5f' }}
                  aria-hidden="true"
                />
                <span>{building.name}</span>
              </button>
              {isActiveBuilding ? (
                <div className="floorList">
                  {buildingFloors.length === 0 ? (
                    <p className="emptyHint">No floors yet.</p>
                  ) : null}
                  {buildingFloors.map((floor) => (
                    <button
                      className={`floorButton ${Number(activeFloorId) === Number(floor.id) ? 'isActive' : ''}`}
                      type="button"
                      key={floor.id}
                      onClick={() => onSelectFloor(floor.id)}
                    >
                      <Layers size={14} />
                      <span>{floor.name}</span>
                      <small>Level {floor.floorNumber}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
