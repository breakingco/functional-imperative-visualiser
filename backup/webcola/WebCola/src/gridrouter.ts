declare function require(name:string);
import vpsc = require('./vpsc');
import shortestpaths = require('./shortestpaths');
import geom = require('./geom');
import LongestCommonSubsequence = require('./longest-common-subsequence');
import NodeWrapper = require('./node-wrapper');
import NodeAccessor = require('./node-accessor');
import Vert = require('./vert');
import Rectangle = require('./rectangle')

var LongestCommonSubsequence = LongestCommonSubsequence.LongestCommonSubsequence;
var NodeWrapper = NodeWrapper.NodeWrapper;
var NodeAccessor = NodeAccessor.NodeAccessor;
var Vert = Vert.Vert;
var Rectangle = Rectangle.Rectangle;

export class GridRouter<Node> {
	leaves:any[] = null;
	groups: NodeWrapper[];
	nodes: NodeWrapper[];
	cols;
	rows;
	root;
	verts: Vert[];
	edges;
	backToFront;
	obstacles;
	passableEdges;
    private avg(a) { return a.reduce((x,y)=>x+y)/a.length }
    private getGridDim(axis) {
        var columns = [];
        var ls = this.leaves.slice(0,this.leaves.length);
        while(ls.length > 0) {
            var r = ls[0].rect;
            var col = ls.filter(v=>v.rect['overlap'+axis.toUpperCase()](r));
            columns.push(col);
            col.forEach(v=> ls.splice(ls.indexOf(v),1));
            col[axis] = this.avg(col.map(v=> v.rect['c'+axis]()))
        }
        columns.sort((x,y)=> x[axis] - y[axis])
        return columns;
    }

    // get the depth of the given node in the group hierarchy
    private getDepth(v) {
        var depth = 0;
        while (v.parent !== this.root) {
            depth++;
            v = v.parent;
        }
        return depth;
    }

    // medial axes between node centres and also boundary lines for the grid
    private midPoints(a) {
        var gap = a[1] - a[0];
        var mids = [a[0]-gap/2];
        for(var i = 1; i < a.length; i++) {
            mids.push((a[i]+a[i-1])/2);
        }
        mids.push(a[a.length-1] + gap/2);
        return mids;
    }

      constructor(public originalnodes: Node[], accessor: NodeAccessor<Node>, public groupPadding: number = 12) {
		this.nodes = originalnodes.map((v,i)=> 
      new NodeWrapper(
        i, 
        accessor.getBounds(v), 
        accessor.getChildren(v)
      )
    );
        this.leaves = this.nodes.filter(v=>v.leaf);
        this.groups = this.nodes.filter(g=>!g.leaf);
        this.cols = this.getGridDim('x');
        this.rows = this.getGridDim('y');

        // create parents for each node or group that is a member of another's children 
        this.groups.forEach(v=>
            v.children.forEach(c=> this.nodes[<number>c].parent = v));

        // root claims the remaining orphans
        this.root = {children:[]};
        this.nodes.forEach(v=> {
            if (typeof v.parent === 'undefined') {
                v.parent = this.root;
                this.root.children.push(v.id);
            }

            // each node will have grid vertices associated with it,
            // some inside the node and some on the boundary
            // leaf nodes will have exactly one internal node at the center
            // and four boundary nodes
            // groups will have potentially many of each
            v.ports = []
        });

        // nodes ordered by their position in the group hierarchy
        this.backToFront = this.nodes.slice(0);
        this.backToFront.sort((x,y)=> this.getDepth(x) - this.getDepth(y)); 

        // compute boundary rectangles for each group
        // has to be done from front to back, i.e. inside groups to outside groups
        // such that each can be made large enough to enclose its interior
        var frontToBackGroups = this.backToFront.slice(0).reverse().filter(g=>!g.leaf);
        frontToBackGroups.forEach(v=> {
            var r = Rectangle.empty();
            v.children.forEach(c=> r = r.union(this.nodes[c].rect));
            v.rect = r.inflate(this.groupPadding);
        });

        var colMids = this.midPoints(this.cols.map(r=> r.x));
        var rowMids = this.midPoints(this.rows.map(r=> r.y));

        // setup extents of lines
        var rowx = colMids[0], rowX = colMids[colMids.length-1];
        var coly = rowMids[0], colY = rowMids[rowMids.length-1];

        // horizontal lines
        var hlines = this.rows.map(r=> <any>{x1: rowx, x2: rowX, y1: r.y, y2: r.y})
                         .concat(rowMids.map(m=> <any>{x1: rowx, x2: rowX, y1: m, y2: m}));

        // vertical lines
        var vlines = this.cols.map(c=> <any>{x1: c.x, x2: c.x, y1: coly, y2: colY})
        				 .concat(colMids.map(m=> <any>{x1: m, x2: m, y1: coly, y2: colY}));

        // the full set of lines
        var lines = hlines.concat(vlines);

        // we record the vertices associated with each line
        lines.forEach(l=>l.verts = []);

        // the routing graph
        this.verts = [];
        this.edges = [];

        // create vertices at the crossings of horizontal and vertical grid-lines
        hlines.forEach(h=> 
            vlines.forEach(v=> {
                var p = new Vert(this.verts.length, v.x1, h.y1);
                h.verts.push(p);
                v.verts.push(p);
                this.verts.push(p);

                // assign vertices to the nodes immediately under them
                var i = this.backToFront.length;
                while (i-- > 0) {
                    var node = this.backToFront[i],
                        r = node.rect;
                    var dx = Math.abs(p.x - r.cx()),
                        dy = Math.abs(p.y - r.cy());
                    if (dx < r.width()/2 && dy < r.height()/2) {
                        (<any>p).node = node;
                        break;
                    }
                }
            })
        );

        lines.forEach((l,li)=> {
            // create vertices at the intersections of nodes and lines
            this.nodes.forEach((v,i)=> {
                  v.rect.lineIntersections(l.x1, l.y1, l.x2, l.y2).forEach((intersect,j)=> {
                      //console.log(li+','+i+','+j+':'+intersect.x + ',' + intersect.y);
                	var p = new Vert(this.verts.length, intersect.x, intersect.y, v, l);
                    this.verts.push(p);
                    l.verts.push(p);
                    v.ports.push(p);
                });
            });

            // split lines into edges joining vertices
            var isHoriz = Math.abs(l.y1 - l.y2) < 0.1;
            var delta = (a,b)=> isHoriz ? b.x - a.x : b.y - a.y;
            l.verts.sort(delta);
            for (var i = 1; i < l.verts.length; i++) {
                var u = l.verts[i-1], v = l.verts[i];
                if (u.node && u.node === v.node && u.node.leaf) continue;
                this.edges.push({source: u.id, target: v.id, length: Math.abs(delta(u,v))});
            }
        });



	}

    // find path from v to root including both v and root
    private findLineage(v) {
        var lineage = [v];
        do {
            v = v.parent; 
            lineage.push(v);
        } while (v!==this.root);
        return lineage.reverse();
    }

    // find path connecting a and b through their lowest common ancestor
    private findAncestorPathBetween(a,b) {
        var aa = this.findLineage(a), ba = this.findLineage(b), i = 0;
        while (aa[i] === ba[i]) i++;
        // i-1 to include common ancestor only once (as first element)
        return {commonAncestor: aa[i-1], lineages: aa.slice(i).concat(ba.slice(i))};
    }

    // when finding a path between two nodes a and b, siblings of a and b on the
    // paths from a and b to their least common ancestor are obstacles
    siblingObstacles(a,b) {
        var path = this.findAncestorPathBetween(a,b);
        var lineageLookup = {};
        path.lineages.forEach(v=> lineageLookup[v.id] = {} );
        var obstacles = path.commonAncestor.children.filter(v=> !(v in lineageLookup));

        path.lineages
        	.filter(v=> v.parent !== path.commonAncestor)
        	.forEach(v=> obstacles = obstacles.concat(v.parent.children.filter(c=> c !== v.id)));

        return obstacles.map(v=> this.nodes[v]);
      }

      // for the given routes, extract all the segments orthogonal to the axis x
      // and return all them grouped by x position
      static getSegmentSets(routes, x, y) {
          // vsegments is a list of vertical segments sorted by x position
          var vsegments = [];
          for (var ei = 0; ei < routes.length; ei++) {
              var route = routes[ei];
              for (var si = 0; si < route.length; si++) {
                  var s = <any>route[si];
                  s.edgeid = ei;
                  s.i = si;
                  var sdx = s[1][x] - s[0][x];
                  if (Math.abs(sdx) < 0.1) {
                      vsegments.push(s);
                  }
              }
          }
          vsegments.sort((a, b) => a[0][x] - b[0][x]);

          // vsegmentsets is a set of sets of segments grouped by x position
          var vsegmentsets = [];
          var segmentset = null;
          for (var i = 0; i < vsegments.length; i++) {
              var s = vsegments[i];
              if (!segmentset || Math.abs(s[0][x] - segmentset.pos) > 0.1) {
                  segmentset = { pos: s[0][x], segments: [] };
                  vsegmentsets.push(segmentset);
              }
              segmentset.segments.push(s);
          }
          return vsegmentsets;
      }
      
      // for all segments in this bundle create a vpsc problem such that
      // each segment's x position is a variable and separation constraints 
      // are given by the partial order over the edges to which the segments belong
      // for each pair s1,s2 of segments in the open set:
      //   e1 = edge of s1, e2 = edge of s2
      //   if leftOf(e1,e2) create constraint s1.x + gap <= s2.x
      //   else if leftOf(e2,e1) create cons. s2.x + gap <= s1.x
      static nudgeSegs(x:string, y: string, routes, segments, leftOf, gap:number) {
          var n = segments.length;
          if (n <= 1) return;
          var vs = segments.map(s => new vpsc.Variable(s[0][x]));
          var cs = [];
          for (var i = 0; i < n; i++) {
              for (var j = 0; j < n; j++) {
                  if (i === j) continue;
                  var s1 = segments[i],
                      s2 = segments[j],
                      e1 = s1.edgeid,
                      e2 = s2.edgeid,
                      lind = -1,
                      rind = -1;
                  // in page coordinates (not cartesian) the notion of 'leftof' is flipped in the horizontal axis from the vertical axis
                  // that is, when nudging vertical segments, if they increase in the y(conj) direction the segment belonging to the
                  // 'left' edge actually needs to be nudged to the right
                  // when nudging horizontal segments, if the segments increase in the x direction
                  // then the 'left' segment needs to go higher, i.e. to have y pos less than that of the right
                  if (x == 'x') {
                      if (leftOf(e1, e2)) {
                          //console.log('s1: ' + s1[0][x] + ',' + s1[0][y] + '-' + s1[1][x] + ',' + s1[1][y]);
                          if (s1[0][y] < s1[1][y]) {
                              lind = j, rind = i;
                          } else {
                              lind = i, rind = j;
                          }
                      } 
                  } else {
                      if (leftOf(e1, e2)) {
                          if (s1[0][y] < s1[1][y]) {
                              lind = i, rind = j;
                          } else {
                              lind = j, rind = i;
                          }
                      }
                  }
                  if (lind >= 0) {
                      //console.log(x+' constraint: ' + lind + '<' + rind);
                      cs.push(new vpsc.Constraint(vs[lind], vs[rind], gap));
                  }
              }
          }
          var solver = new vpsc.Solver(vs, cs);
          solver.solve();
          vs.forEach((v, i) => {
              var s = segments[i];
              var pos = v.position();
              s[0][x] = s[1][x] = pos;
              var route = routes[s.edgeid];
              if (s.i > 0) route[s.i - 1][1][x] = pos;
              if (s.i < route.length - 1) route[s.i + 1][0][x] = pos;
          });
      }

      static nudgeSegments(routes, x:string, y:string, leftOf: (e1:number,e2:number)=>boolean, gap: number) {
          var vsegmentsets = GridRouter.getSegmentSets(routes, x, y);
          // scan the grouped (by x) segment sets to find co-linear bundles
          for (var i = 0; i < vsegmentsets.length; i++) {
              var ss = vsegmentsets[i];
              var events = [];
              for (var j = 0; j < ss.segments.length; j++) {
                  var s = ss.segments[j];
                  events.push({ type: 0, s: s, pos: Math.min(s[0][y], s[1][y]) });
                  events.push({ type: 1, s: s, pos: Math.max(s[0][y], s[1][y]) });
              }
              events.sort((a, b) => a.pos - b.pos + a.type - b.type);
              var open = [];
              var openCount = 0;
              events.forEach(e=> {
                  if (e.type === 0) {
                      open.push(e.s);
                      openCount++;
                  } else {
                      openCount--;
                  }
                  if (openCount == 0) {
                      GridRouter.nudgeSegs(x, y, routes, open, leftOf, gap);
                      open = [];
                  }
              });
          }
      }

      // obtain routes for the specified edges, nicely nudged apart
      // warning: edge paths may be reversed such that common paths are ordered consistently within bundles!
      routeEdges<Edge>(edges: Edge[], gap: number, source: (e: Edge) => number, target: (e: Edge) => number): geom.Point[][][]{
          var routePaths = edges.map(e=> this.route(source(e), target(e)));
          var order = GridRouter.orderEdges(routePaths);
          var routes = routePaths.map(function (e) { return GridRouter.makeSegments(e); });
          GridRouter.nudgeSegments(routes, 'x', 'y', order, gap);
          GridRouter.nudgeSegments(routes, 'y', 'x', order, gap);
          return routes;
      }

      static angleBetween2Lines(line1: geom.Point[], line2: geom.Point[]): number {
          var angle1 = Math.atan2(line1[0].y - line1[1].y,
              line1[0].x - line1[1].x);
          var angle2 = Math.atan2(line2[0].y - line2[1].y,
              line2[0].x - line2[1].x);
          var diff = angle1 - angle2;
          if (diff > Math.PI || diff < -Math.PI) {
              diff = angle2 - angle1;
          }
          return diff;
      }

      // does the path a-b-c describe a left turn?
      private static isLeft(a, b, c) {
          return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) <= 0;
      }

      // for the given list of ordered pairs, returns a function that (efficiently) looks-up a specific pair to
      // see if it exists in the list
      private static getOrder(pairs: { l: number; r: number }[]): (l: number, r: number) => boolean {
          var outgoing = {};
          for (var i = 0; i < pairs.length; i++) {
              var p = pairs[i];
              if (typeof outgoing[p.l] === 'undefined') outgoing[p.l] = {};
              outgoing[p.l][p.r] = true;
          }
          return (l, r) => typeof outgoing[l] !== 'undefined' && outgoing[l][r];
      }

      // returns an ordering (a lookup function) that determines the correct order to nudge the
      // edge paths apart to minimize crossings
      static orderEdges(edges) {
          var edgeOrder = [];
          for (var i = 0; i < edges.length - 1; i++) {
              for (var j = i + 1; j < edges.length; j++) {
                  var e = edges[i],
                      f = edges[j],
                      lcs = new LongestCommonSubsequence(e, f);
                  var u, vi, vj;
                  if (lcs.length === 0)
                      continue; // no common subpath
                  if (lcs.reversed) {
                      // if we found a common subpath but one of the edges runs the wrong way, 
                      // then reverse f.
                      f.reverse();
                      f.reversed = true;
                      lcs = new LongestCommonSubsequence(e, f);
                  }
                  if (lcs.length === e.length || lcs.length === f.length) {
                      // the edges are completely co-linear so make an arbitrary ordering decision
                      edgeOrder.push({ l: i, r: j });
                      continue;
                  }
                  if (lcs.si + lcs.length >= e.length || lcs.ti + lcs.length >= f.length) {
                      // if the common subsequence of the
                      // two edges being considered goes all the way to the
                      // end of one (or both) of the lines then we have to 
                      // base our ordering decision on the other end of the
                      // common subsequence
                      u = e[lcs.si + 1];
                      vj = e[lcs.si - 1];
                      vi = f[lcs.ti - 1];
                  } else {
                      u = e[lcs.si + lcs.length - 2];
                      vi = e[lcs.si + lcs.length];
                      vj = f[lcs.ti + lcs.length];
                  }
                  if (GridRouter.isLeft(u, vi, vj)) {
                      edgeOrder.push({ l: j, r: i });
                  } else {
                      edgeOrder.push({ l: i, r: j });
                  }
              }
          }
          //edgeOrder.forEach(function (e) { console.log('l:' + e.l + ',r:' + e.r) });
          return GridRouter.getOrder(edgeOrder);
      }

      // for an orthogonal path described by a sequence of points, create a list of segments
      // if consecutive segments would make a straight line they are merged into a single segment
      // segments are over cloned points, not the original vertices
      static makeSegments(path: geom.Point[]): geom.Point[][]{
          function copyPoint(p: geom.Point) {
              return <geom.Point>{ x: p.x, y: p.y };
          }
          var isStraight = (a, b, c) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 0.001;
          var segments = [];
          var a = copyPoint(path[0]);
          for (var i = 1; i < path.length; i++) {
              var b = copyPoint(path[i]), c = i < path.length - 1 ? path[i + 1] : null;
              if (!c || !isStraight(a, b, c)) {
                  segments.push([a, b]);
                  a = b;
              }
          }
          return segments;
      }

    // find a route between node s and node t
    // returns an array of indices to verts
      route(s: number, t: number): geom.Point[]{
    	var source = this.nodes[<number>s], target = this.nodes[<number>t];
    	this.obstacles = this.siblingObstacles(source, target);

        var obstacleLookup = {};
        this.obstacles.forEach(o => obstacleLookup[o.id] = o);
        this.passableEdges = this.edges.filter(e=> {
            var u = this.verts[e.source],
                v = this.verts[e.target];
            return !(u.node && u.node.id in obstacleLookup 
                     || v.node && v.node.id in obstacleLookup);
        });

          // add dummy segments linking ports inside source and target
        for(var i = 1; i < source.ports.length; i++) {
            var u = source.ports[0].id;
            var v = source.ports[i].id;
            this.passableEdges.push({
                source: u,
                target: v,
                length: 0
            });
        }
        for(var i = 1; i < target.ports.length; i++) {
            var u = target.ports[0].id;
            var v = target.ports[i].id;
            this.passableEdges.push({
                source: u,
                target: v,
                length: 0
            });
        }

        var getSource = e=>e.source,
            getTarget = e=>e.target,
            getLength = e=>e.length;

        var shortestPathCalculator = new shortestpaths.Calculator(this.verts.length, this.passableEdges, getSource, getTarget, getLength);
        var bendPenalty = (u,v,w)=> {
      		var a = this.verts[u], b = this.verts[v], c = this.verts[w];
      		var dx = Math.abs(c.x - a.x), dy = Math.abs(c.y - a.y);
      		// don't count bends from internal node edges
      		if (a.node === source && a.node === b.node || b.node === target && b.node === c.node) 
      			return 0;
      		return dx > 1 && dy > 1  ? 1000 : 0;
          };

          // get shortest path
        var shortestPath = shortestPathCalculator.PathFromNodeToNodeWithPrevCost(
        	source.ports[0].id, target.ports[0].id,
              bendPenalty);
          
          // shortest path is reversed and does not include the target port
          var pathPoints = shortestPath.reverse().map(vi => this.verts[vi]);
          pathPoints.push(this.nodes[target.id].ports[0]);

          // filter out any extra end points that are inside the source or target (i.e. the dummy segments above)
          return pathPoints.filter((v, i) => 
              !(i < pathPoints.length - 1 && pathPoints[i + 1].node === source && v.node === source
              || i > 0 && v.node === target && pathPoints[i - 1].node === target));
    }
  }